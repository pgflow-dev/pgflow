import type { CreateWorkerFn, Logger, PlatformAdapter } from './types.js';
import type { Worker } from '../core/Worker.js';
import type { Sql } from 'postgres';
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
import { Queries } from '../core/Queries.js';
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
  private logger: Logger;
  private abortController: AbortController;
  private _platformResources: SupabaseResources;
  private validatedEnv: SupabaseEnv;
  private _connectionString: string | undefined;
  private queries: Queries;
  private deps: SupabasePlatformDeps;

  // Logging factory with dynamic workerId support
  private loggingFactory = createLoggingFactory();

  constructor(
    options?: { sql?: Sql; connectionString?: string },
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

    // Set initial log level
    const logLevel = this.validatedEnv.EDGE_WORKER_LOG_LEVEL || 'info';
    this.loggingFactory.setLogLevel(logLevel);

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

  async stopWorker(): Promise<void> {
    // Trigger shutdown signal
    this.abortController.abort();

    // Cleanup resources
    await this._platformResources.sql.end();

    if (this.worker) {
      await this.worker.stop();
    }
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
  get sql(): Sql {
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

      if (this.worker) {
        // Signal death to ensure_workers() cron by setting stopped_at.
        // This allows the cron to immediately ping for a replacement worker.
        const workerId = this.validatedEnv.SB_EXECUTION_ID;
        await this.queries.markWorkerStopped(workerId);
      }

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
    this.deps.serve((req: Request) => {
      // Validate auth header in production (skipped in local mode)
      const authResult = validateServiceRoleAuth(req, this.validatedEnv);
      if (!authResult.valid) {
        this.logger.warn(`Auth validation failed: ${authResult.error}`);
        if (authResult.error?.includes('misconfigured')) {
          return createServerErrorResponse();
        }
        return createUnauthorizedResponse();
      }

      this.logger.debug(`HTTP Request: ${this.edgeFunctionName}`);

      const wasStarted = !this.worker;

      if (!this.worker) {
        this.edgeFunctionName = this.extractFunctionName(req);

        const workerId = this.validatedEnv.SB_EXECUTION_ID;

        this.loggingFactory.setWorkerId(workerId);

        // Create the worker using the factory function and the logger
        this.worker = createWorkerFn(this.loggingFactory.createLogger);
        this.worker.startOnlyOnce({
          edgeFunctionName: this.edgeFunctionName,
          workerId,
        });
      }

      return new Response(JSON.stringify({
        status: wasStarted ? 'started' : 'running',
        workerId: this.validatedEnv.SB_EXECUTION_ID,
        functionName: this.edgeFunctionName,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
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
