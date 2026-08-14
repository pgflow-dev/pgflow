import type postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseResources } from '@pgflow/dsl/supabase';
import type { CreateWorkerFn, Logger, PlatformAdapter } from './types.js';
import type { Worker } from '../core/Worker.js';
import { createServiceSupabaseClient } from '../core/supabase-utils.js';
import { Queries } from '../core/Queries.js';
import { isLocalSupabaseEnv } from '../shared/localDetection.js';
import { createLoggingFactory } from './logging.js';
import { resolveConnectionString, resolveSqlConnection } from './resolveConnection.js';
import { getProcessDeps, type ProcessDeps, type ProcessSignal } from './processDeps.js';

interface ProcessEnv extends Record<string, string | undefined> {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WORKER_NAME?: string;
  DATABASE_URL?: string;
  EDGE_WORKER_DB_URL?: string;
  EDGE_WORKER_LOG_LEVEL?: string;
}

type ProcessAdapterOptions = {
  sql?: postgres.Sql;
  connectionString?: string;
  maxPgConnections?: number;
};

export class ProcessPlatformAdapter implements PlatformAdapter<SupabaseResources> {
  private readonly deps: ProcessDeps;
  private readonly logger: Logger;
  private readonly loggingFactory: ReturnType<typeof createLoggingFactory>;
  private readonly abortController = new AbortController();
  private readonly validatedEnv: ProcessEnv;
  private readonly _connectionString: string | undefined;
  private readonly _platformResources: SupabaseResources;
  private readonly ownsSql: boolean;
  private readonly queries: Queries;
  private worker: Worker | null = null;
  private workerId: string | null = null;
  private startupPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private gracefulExitPromise: Promise<void> | null = null;
  private cleanupPromise: Promise<void> | null = null;
  private signalHandlersRegistered = false;
  private signalCount = 0;
  private readonly signalHandler = () => this.handleSignal();

  constructor(
    options?: ProcessAdapterOptions,
    deps: ProcessDeps = getProcessDeps()
  ) {
    this.deps = deps;
    this.assertProcessEnv(deps.env);
    this.validatedEnv = deps.env;
    const connectionOptions = {
      ...options,
      hasSql: !!options?.sql,
      allowDatabaseUrl: true,
    };
    this._connectionString = resolveConnectionString(
      this.validatedEnv,
      connectionOptions
    );
    this.ownsSql = !options?.sql;
    this.loggingFactory = createLoggingFactory(this.validatedEnv);
    this.logger = this.loggingFactory.createLogger('ProcessPlatformAdapter');
    this._platformResources = {
      sql: resolveSqlConnection(this.validatedEnv, connectionOptions),
      supabase: createServiceSupabaseClient(this.validatedEnv),
    };
    this.queries = new Queries(this._platformResources.sql);
  }

  startWorker(createWorkerFn: CreateWorkerFn): Promise<void> {
    this.registerSignalHandlers();
    this.startupPromise ??= this.performStartWorker(createWorkerFn).catch(
      async (error) => {
        await this.cleanup();
        throw error;
      }
    );
    return this.startupPromise;
  }

  stopWorker(): Promise<void> {
    this.stopPromise ??= Promise.resolve().then(() => this.performStopWorker());
    return this.stopPromise;
  }

  requestShutdown(): void {
    this.abortController.abort();
  }

  createLogger(module: string): Logger {
    return this.loggingFactory.createLogger(module);
  }

  get connectionString(): string | undefined {
    return this._connectionString;
  }

  get env(): Record<string, string | undefined> {
    return this.validatedEnv;
  }

  get shutdownSignal(): AbortSignal {
    return this.abortController.signal;
  }

  get platformResources(): SupabaseResources {
    return this._platformResources;
  }

  get isLocalEnvironment(): boolean {
    return isLocalSupabaseEnv(this.validatedEnv);
  }

  get sql(): postgres.Sql {
    return this._platformResources.sql;
  }

  get supabase(): SupabaseClient {
    return this._platformResources.supabase;
  }

  private async performStartWorker(createWorkerFn: CreateWorkerFn): Promise<void> {
    const workerName = this.validatedEnv.WORKER_NAME || 'pgflow-worker';
    const workerId = this.deps.randomUUID();

    this.workerId = workerId;
    this.loggingFactory.setWorkerId(workerId);
    this.loggingFactory.setWorkerName(workerName);

    this.worker = createWorkerFn(this.loggingFactory.createLogger);
    this.worker.onDeprecated(() => {
      this.handleDeprecation().catch(() => undefined);
    });

    await this.worker.startOnlyOnce({
      edgeFunctionName: workerName,
      workerId,
      startMode: 'process',
    });
  }

  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) return;

    this.signalHandlersRegistered = true;
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGQUIT'] satisfies ProcessSignal[]) {
      this.deps.onSignal(signal, this.signalHandler);
    }
  }

  private removeSignalHandlers(): void {
    if (!this.signalHandlersRegistered) return;

    this.signalHandlersRegistered = false;
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGQUIT'] satisfies ProcessSignal[]) {
      this.deps.offSignal?.(signal, this.signalHandler);
    }
  }

  private async performStopWorker(): Promise<void> {
    this.requestShutdown();

    try {
      await this.startupPromise;
      if (this.worker) {
        await this.worker.stop();
      }
      if (this.workerId) {
        await this.queries.markWorkerStopped(this.workerId);
      }
    } finally {
      await this.cleanup();
    }
  }

  private cleanup(): Promise<void> {
    this.cleanupPromise ??= (async () => {
      this.removeSignalHandlers();
      if (this.ownsSql) {
        await this._platformResources.sql.end();
      }
    })();
    return this.cleanupPromise;
  }

  private gracefulExit(): Promise<void> {
    this.gracefulExitPromise ??= (async () => {
      let exitCode = 0;
      try {
        await this.stopWorker();
      } catch (error) {
        this.logger.error('Process worker shutdown failed', error);
        exitCode = 1;
      }
      this.deps.setExitCode(exitCode);
      this.deps.exit(exitCode);
    })();
    return this.gracefulExitPromise;
  }

  private async handleDeprecation(): Promise<void> {
    await this.gracefulExit();
  }

  private async handleSignal(): Promise<void> {
    this.signalCount++;
    if (this.signalCount > 1) {
      this.deps.exit(1);
    }

    await this.gracefulExit();
  }

  private assertProcessEnv(env: Record<string, string | undefined>): asserts env is ProcessEnv {
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
    const missing = required.filter((key) => !env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}
