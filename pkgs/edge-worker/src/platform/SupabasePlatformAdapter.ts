import type { CreateWorkerFn, Logger, PlatformAdapter } from './types.js';
import type { Worker } from '../core/Worker.js';
import type postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseResources } from '@pgflow/dsl/supabase';
import { createServiceSupabaseClient } from '../core/supabase-utils.js';
import { createLoggingFactory } from './logging.js';
import { isLocalSupabaseEnv } from '../shared/localDetection.js';
import {
  validateServiceRoleAuth,
  createUnauthorizedResponse,
  createServerErrorResponse,
} from '../shared/authValidation.js';
import {
  resolveConnectionString,
  resolveSqlConnection,
} from './resolveConnection.js';
import { Queries, WorkerInvocationRejectedError } from '../core/Queries.js';
import { getPlatformDeps, type SupabasePlatformDeps } from './deps.js';

/**
 * Supabase-specific environment variables
 */
interface SupabaseEnv extends Record<string, string | undefined> {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EDGE_WORKER_DB_URL?: string;
  SB_EXECUTION_ID: string;
  EDGE_WORKER_LOG_LEVEL?: string;
}


/**
 * Hard ceiling for the whole Supabase shutdown operation: replacement
 * settlement, worker drain, marking, and SQL close must all fit inside it.
 */
const SUPABASE_SHUTDOWN_DEADLINE_MS = 5_000;

// A local watchdog releases a hung runtime's startup guard. SQL's 60-second
// database-clock expiry still authorizes readiness; this timer never does.
const SUPABASE_STARTUP_TIMEOUT_MS = 60_000;

/**
 * Supabase platform adapter for Deno runtime environment.
 * IMPORTANT: This class assumes it is running within a Deno environment
 * with access to the `Deno` and `EdgeRuntime` global objects.
 *
 * NOTE: This code uses Deno specific APIs and is not meant to be executed in Node.js environments.
 * The TypeScript compilation in Node.js is only used for type checking and distribution.
 */
export class SupabasePlatformAdapter implements PlatformAdapter<SupabaseResources> {
  private edgeFunctionName: string | null = null;
  private worker: Worker | null = null;
  private workerId: string | null = null;
  private workerReplacementPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private logger: Logger;
  private abortController: AbortController;
  private _platformResources: SupabaseResources;
  private validatedEnv: SupabaseEnv;
  private _connectionString: string | undefined;
  private queries: Queries;
  private deps: SupabasePlatformDeps;

  // Logging factory with dynamic workerId support (initialized in constructor)
  private loggingFactory!: ReturnType<typeof createLoggingFactory>;

  constructor(
    options?: { sql?: postgres.Sql; connectionString?: string; maxPgConnections?: number },
    deps: SupabasePlatformDeps = getPlatformDeps()
  ) {
    this.deps = deps;

    // Validate environment variables once at startup
    const env = deps.getEnv();
    this.assertSupabaseEnv(env);
    this.validatedEnv = env;

    // Keep connection string for the getter (interface requirement)
    this._connectionString = resolveConnectionString(env, {
      hasSql: !!options?.sql,
      connectionString: options?.connectionString,
    });

    // Create abort controller for shutdown signal
    this.abortController = new AbortController();

    // Create logging factory with environment for auto-configuration
    // (log level, format, and colors are determined from env)
    this.loggingFactory = createLoggingFactory(env);

    // startWorker logger with a default module name
    this.logger = this.loggingFactory.createLogger('SupabasePlatformAdapter');
    this.logger.debug('SupabasePlatformAdapter logger instance created and working.');

    // Initialize platform resources - single call handles all priority logic
    this._platformResources = {
      sql: resolveSqlConnection(env, options),
      supabase: createServiceSupabaseClient(this.validatedEnv)
    };

    // Create Queries instance for shutdown handler
    this.queries = new Queries(this._platformResources.sql);
  }

  /**
   * startWorker the platform adapter with a worker factory function
   * @param createWorkerFn Function that creates a worker instance when called with a logger
   */
  async startWorker(createWorkerFn: CreateWorkerFn): Promise<void> {
    this.extendLifetimeOfEdgeFunction();
    this.setupShutdownHandler();
    this.setupStartupHandler(createWorkerFn);
    // Return a resolved promise to satisfy the async requirement
    await Promise.resolve();
  }

  stopWorker(): Promise<void> {
    this.stopPromise ??= this.performStopWorker();
    return this.stopPromise;
  }

  /**
   * Single shared stop operation: concurrent callers share it and SQL closes
   * exactly once. Awaits any in-flight worker replacement so the worker row
   * is guaranteed to exist before it is marked stopped.
   *
   * The whole operation (replacement settlement, worker drain, marking) runs
   * under one deadline; when the deadline expires SQL is force-closed and the
   * stop rejects with a timeout error.
   */
  private async performStopWorker(): Promise<void> {
    this.requestShutdown();

    const startedAt = Date.now();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const deadlinePromise = new Promise<void>((resolve) => {
      deadlineTimer = setTimeout(() => {
        resolve();
      }, SUPABASE_SHUTDOWN_DEADLINE_MS);
    });

    // Boxed so a rejection value of undefined cannot be mistaken for success,
    // and so a synchronously throwing peer can never reject this promise.
    const work = this.drainAndMark().then(
      (failure) => ({ failure }),
      (error) => ({ failure: { error } })
    );

    const settled = await Promise.race([
      work.then(() => 'work' as const),
      deadlinePromise.then(() => 'deadline' as const),
    ]);
    clearTimeout(deadlineTimer);

    if (settled === 'deadline') {
      this.logger.warn(
        `Supabase shutdown exceeded the ${SUPABASE_SHUTDOWN_DEADLINE_MS}ms deadline; forcing sql close`
      );
      try {
        await this._platformResources.sql.end({ timeout: 0 });
      } catch (closeError) {
        this.logger.error('Failed to force close sql connection', closeError);
      }
      // The detached operation may still settle later; observe it so it
      // cannot surface as an unhandled rejection.
      work.then(({ failure }) => {
        if (failure) {
          this.logger.error('Supabase shutdown operation failed after the deadline', failure.error);
        }
      });
      throw new Error(`Supabase shutdown timed out after ${SUPABASE_SHUTDOWN_DEADLINE_MS}ms`);
    }

    const { failure } = await work;

    const remainingMs = Math.max(SUPABASE_SHUTDOWN_DEADLINE_MS - (Date.now() - startedAt), 0);
    try {
      await this._platformResources.sql.end({ timeout: remainingMs / 1000 });
    } catch (closeError) {
      if (!failure) {
        throw closeError;
      }
      // A failing close must not replace the earlier operation error.
      this.logger.error('Failed to close sql connection', closeError);
    }

    if (failure) {
      throw failure.error;
    }
  }

  /**
   * Waits for any in-flight replacement, then drains the current worker and
   * marks it stopped. The drain starts before marking so database bookkeeping
   * can never delay it, and both peers are awaited so one failure cannot skip
   * the other. Resolves with the first operational failure (if any), never
   * rejects.
   */
  private async drainAndMark(): Promise<{ error: unknown } | null> {
    // Capture the promise before awaiting: its owner clears the field in a
    // finally block, but shutdown must await the replacement it observed.
    const replacement = this.workerReplacementPromise;
    if (replacement) {
      // Startup/replacement rejection is already handled by the HTTP
      // startup path; shutdown continues with cleanup.
      await replacement.catch(() => undefined);
    }

    // Snapshot after replacement settlement: replaceWorker may still be
    // swapping worker and worker id.
    const worker = this.worker;
    const workerId = this.workerId;
    if (!worker) {
      return null;
    }

    // Signal death to ensure_workers() cron by setting stopped_at.
    // This allows the cron to immediately ping for a replacement worker.
    const [drainResult, markResult] = await Promise.allSettled([
      worker.stop(),
      workerId ? this.queries.markWorkerStopped(workerId) : Promise.resolve(),
    ]);

    const failures: unknown[] = [];
    if (drainResult.status === 'rejected') {
      this.logger.error('Failed to drain worker', drainResult.reason);
      failures.push(drainResult.reason);
    }
    if (markResult.status === 'rejected') {
      this.logger.error('Failed to mark worker stopped', markResult.reason);
      failures.push(markResult.reason);
    }

    if (failures.length === 0) {
      return null;
    }
    if (failures.length === 1) {
      return { error: failures[0] };
    }
    return {
      error: new AggregateError(failures, 'Worker drain and worker marking both failed'),
    };
  }

  requestShutdown(): void {
    this.abortController.abort();
  }

  createLogger(module: string): Logger {
    return this.loggingFactory.createLogger(module);
  }

  /**
   * Ensures the config has a connectionString by using the environment value if needed
   */
  get connectionString(): string | undefined {
    return this._connectionString;
  }

  /**
   * Whether running in a local/development environment.
   */
  get isLocalEnvironment(): boolean {
    return isLocalSupabaseEnv(this.validatedEnv);
  }

  /**
   * Get all environment variables as a record
   */
  get env(): Record<string, string | undefined> {
    return this.validatedEnv;
  }

  /**
   * Get the shutdown signal that fires when the worker is shutting down
   */
  get shutdownSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Get SQL client - exposed for context creation
   */
  get sql(): postgres.Sql {
    return this._platformResources.sql;
  }

  /**
   * Get Supabase client with service role key - exposed for context creation
   */
  get supabase(): SupabaseClient {
    return this._platformResources.supabase;
  }

  /**
   * Get platform-specific resources
   */
  get platformResources(): SupabaseResources {
    return this._platformResources;
  }

  private extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }

  private setupShutdownHandler(): void {
    this.deps.onShutdown(async () => {
      this.logger.debug('Shutting down...');
      await this.stopWorker();
    });
  }

  /**
   * Supabase EdgeRuntime exposes waitUntil method as a way to extend
   * the lifetime of the function until the promise resolves.
   *
   * We leverage this to extend the lifetime to the absolute maximum,
   * by passing a promise that never resolves.
   */
  private extendLifetimeOfEdgeFunction(): void {
    const promiseThatNeverResolves = new Promise(() => {
      // Intentionally empty - this promise never resolves to extend function lifetime
    });
    this.deps.extendLifetime(promiseThatNeverResolves);
  }

  private setupStartupHandler(createWorkerFn: CreateWorkerFn): void {
    this.deps.serve(async (req: Request) => {
      // Validate auth header in production (skipped in local mode)
      const authResult = validateServiceRoleAuth(req, this.validatedEnv);
      if (!authResult.valid) {
        this.logger.warn(`Auth validation failed: ${authResult.error}`);
        if (authResult.error?.includes('misconfigured')) {
          return createServerErrorResponse();
        }
        return createUnauthorizedResponse();
      }

      const functionName = this.extractFunctionName(req);
      let invocationId: string | undefined;
      try {
        const text = await req.text();
        const body: unknown = text ? JSON.parse(text) : {};
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
        const id = (body as { invocation_id?: unknown }).invocation_id;
        if (id !== undefined) {
          if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
            throw new Error('Invalid invocation_id');
          }
          invocationId = id;
        }
      } catch {
        return Response.json({ error: 'Expected a JSON object with an optional UUID invocation_id' }, { status: 400 });
      }

      try {
        if (this.stopPromise) throw new Error('Worker startup rejected: shutdown in progress');
        // Authenticated manual calls (and local development) reserve through
        // the same SQL protocol. They never bypass a pending startup.
        if (!invocationId) {
          if (!this.workerReplacementPromise && this.worker?.isRunning && this.workerId
            && await this.queries.isWorkerHealthy(functionName, this.workerId)) {
            if (this.stopPromise) throw new Error('Worker startup rejected: shutdown in progress');
            return Response.json({ status: 'running', workerId: this.workerId, functionName });
          }
          await this.queries.registerHttpWorkerFunction(functionName);
          invocationId = await this.queries.reserveWorkerInvocation(functionName) ?? undefined;
          if (!invocationId) {
            return Response.json({ status: 'startup_unavailable', functionName }, { status: 409 });
          }
        }
        const wasStarted = await this.ensureWorkerStarted(functionName, invocationId, createWorkerFn);

        return Response.json({
          status: wasStarted ? 'started' : 'running',
          workerId: this.workerId,
          functionName,
          invocationId,
        });
      } catch (error) {
        if (invocationId && !(error instanceof WorkerInvocationRejectedError)) {
          await this.queries.dismissWorkerInvocation(functionName, invocationId, String(error))
            .catch((dismissError) => this.logger.error('Could not dismiss failed startup', dismissError));
        }
        if (error instanceof WorkerInvocationRejectedError) {
          return Response.json({ status: 'invocation_rejected', invocationId }, { status: 409 });
        }
        this.logger.error('Worker startup failed', error);
        return createServerErrorResponse();
      }
    });
  }

  /**
   * Serializes worker startup across concurrent HTTP requests: every request
   * waits for an in-flight replacement, exactly one request owns each
   * replacement, and once `stopPromise` exists no request can admit a new
   * replacement or report readiness after shutdown began.
   */
  private async ensureWorkerStarted(
    functionName: string, invocationId: string, createWorkerFn: CreateWorkerFn
  ): Promise<boolean> {
    for (;;) {
      if (this.stopPromise) {
        throw new Error('Worker startup rejected: shutdown in progress');
      }

      // Wait for an in-flight replacement before deciding anything: the
      // worker reference exists while its startup is still pending.
      const inFlight = this.workerReplacementPromise;
      if (inFlight) {
        await inFlight;
        continue;
      }

      // Reconcile each request after any in-flight startup settles. Receipt
      // alone cannot consume the token, and a ready runtime must acknowledge
      // the specific invocation without another processing loop.
      const reconciledWorker = this.worker;
      const status = await this.queries.reconcileWorkerInvocation(
        functionName, invocationId, reconciledWorker?.isRunning ? this.workerId : null
      );
      // A completed replacement can clear its promise before SQL responds.
      // Its new identity makes this reconciliation stale, even without a guard.
      if (this.worker !== reconciledWorker) continue;
      if (status === 'rejected') throw new WorkerInvocationRejectedError();
      if (this.stopPromise) throw new Error('Worker startup rejected: shutdown in progress');
      // SQL awaits can admit another request in this runtime. Re-check before
      // owning startup; a different runtime still arbitrates in SQL at readiness.
      if (this.workerReplacementPromise) continue;
      if (status === 'ready') return false;

      // Assign and own the replacement in one synchronous section so
      // shutdown always observes an admitted replacement.
      const owned = this.replaceWorker(functionName, invocationId, createWorkerFn);
      this.workerReplacementPromise = owned;
      try {
        await owned;
      } finally {
        if (this.workerReplacementPromise === owned) {
          this.workerReplacementPromise = null;
        }
      }

      // Re-check shutdown after the awaited replacement instead of reporting
      // readiness directly: once stopPromise exists, no request may report
      // a started worker.
      if (this.stopPromise) {
        throw new Error('Worker startup rejected: shutdown in progress');
      }
      return true;
    }
  }

  private async replaceWorker(
    functionName: string, invocationId: string, createWorkerFn: CreateWorkerFn
  ): Promise<void> {
    const previousWorkerId = this.workerId;

    if (this.worker) {
      await this.worker.stop();
      if (previousWorkerId) {
        await this.queries.markWorkerStopped(previousWorkerId);
      }
    }

    this.edgeFunctionName = functionName;

    const workerId = previousWorkerId === null
      ? this.validatedEnv.SB_EXECUTION_ID
      : globalThis.crypto.randomUUID();
    this.workerId = workerId;

    this.loggingFactory.setWorkerId(workerId);
    this.loggingFactory.setWorkerName(this.edgeFunctionName);

    // Reset even when a timed-out startup cleared the previous worker.
    // Once adapter shutdown starts, the platform signal must stay aborted.
    if (!this.stopPromise) this.abortController = new AbortController();

    // Create the worker using the factory function and the logger
    const worker = createWorkerFn(this.loggingFactory.createLogger);
    this.worker = worker;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      await Promise.race([
        worker.startOnlyOnce({
          edgeFunctionName: this.edgeFunctionName,
          workerId,
          startMode: 'http',
          invocationId,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error(`Worker startup timed out after ${SUPABASE_STARTUP_TIMEOUT_MS}ms`));
          }, SUPABASE_STARTUP_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      if (timedOut) {
        // stop() aborts before it awaits initialization. Do not await a hung
        // startup here: if it resumes, the aborted worker cannot process.
        void worker.stop().catch((stopError) => this.logger.error('Timed-out startup cleanup failed', stopError));
      }
      if (this.worker === worker) {
        this.worker = null;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Assertion function that validates environment has all required Supabase fields
   * @throws Error if any required environment variable is missing
   */
  private assertSupabaseEnv(env: Record<string, string | undefined>): asserts env is SupabaseEnv {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SB_EXECUTION_ID'
    ] as const;

    const missing: string[] = [];

    for (const key of required) {
      if (!env[key]) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}\n` +
        'See docs to learn how to prepare the environment:\n' +
        'https://www.pgflow.dev/how-to/prepare-db-string/'
      );
    }
  }
}
