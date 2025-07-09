import type { SupabaseResources } from '../core/context.js';
import type { CreateWorkerFn, Logger, PlatformAdapter } from './types.js';
import type { Worker } from '../core/Worker.js';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSql } from '../core/sql-factory.js';
import { getAnonSupabaseClient, getServiceSupabaseClient } from '../core/supabase-utils.js';
import { createLoggingFactory } from './logging.js';

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
  private _sql: Sql | null = null;

  // Logging factory with dynamic workerId support
  private loggingFactory = createLoggingFactory();

  // Resource accessors
  private getSql: () => Sql;
  private getAnonSupabase: () => SupabaseClient;
  private getServiceSupabase: () => SupabaseClient;

  constructor() {
    // Create abort controller for shutdown signal
    this.abortController = new AbortController();
    
    // Set initial log level
    const logLevel = this.getEnvVar('EDGE_WORKER_LOG_LEVEL', 'info');
    this.loggingFactory.setLogLevel(logLevel);

    // startWorker logger with a default module name
    this.logger = this.loggingFactory.createLogger('SupabasePlatformAdapter');
    this.logger.debug('SupabasePlatformAdapter logger instance created and working.'); // Use the created logger
    
    // Setup resource factories - use the already-memoized utilities
    this.getSql = () => {
      if (!this._sql) {
        this._sql = createSql(this.env);
      }
      return this._sql;
    };

    this.getAnonSupabase = () => {
      const client = getAnonSupabaseClient(this.env); // Already memoized
      if (!client) {
        throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment');
      }
      return client;
    };

    this.getServiceSupabase = () => {
      const client = getServiceSupabaseClient(this.env); // Already memoized
      if (!client) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
      }
      return client;
    };
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
    if (this._sql) {
      await this._sql.end();
    }
    
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
  get connectionString(): string {
    return this.getEnvVarOrThrow('EDGE_WORKER_DB_URL');
  }

  /**
   * Get the Supabase URL for the current environment
   */
  private getEnvVarOrThrow(name: string): string {
    const envVar = this.getEnvVar(name);

    if (!envVar) {
      const message =
        `${name} is not set!\n` +
        'See docs to learn how to prepare the environment:\n' +
        'https://www.pgflow.dev/how-to/prepare-db-string/';
      throw new Error(message);
    }

    return envVar;
  }

  /**
   * Get the environment variable value if not undefined or "" otherwise the default value if provided
   */
  private getEnvVar(name: string): string | undefined;
  private getEnvVar(name: string, defaultValue: string): string;
  private getEnvVar(name: string, defaultValue?: string): string | undefined {
    return Deno.env.get(name) || defaultValue;
  }

  /**
   * Get all environment variables as a record
   */
  get env(): Record<string, string | undefined> {
    return Deno.env.toObject();
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
    return this.getSql();
  }

  /**
   * Get anonymous Supabase client - exposed for context creation
   */
  get anonSupabase(): SupabaseClient {
    return this.getAnonSupabase();
  }

  /**
   * Get service Supabase client - exposed for context creation
   */
  get serviceSupabase(): SupabaseClient {
    return this.getServiceSupabase();
  }

  /**
   * Get platform-specific resources
   */
  get platformResources(): SupabaseResources {
    return {
      sql: this.sql,
      anonSupabase: this.anonSupabase,
      serviceSupabase: this.serviceSupabase
    };
  }

  private async spawnNewEdgeFunction(): Promise<void> {
    if (!this.edgeFunctionName) {
      throw new Error('functionName cannot be null or empty');
    }

    const supabaseUrl = this.getEnvVarOrThrow('SUPABASE_URL');
    const supabaseAnonKey = this.getEnvVarOrThrow('SUPABASE_ANON_KEY');

    this.logger.debug('Spawning a new Edge Function...');

    const response = await fetch(
      `${supabaseUrl}/functions/v1/${this.edgeFunctionName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    this.logger.debug('Edge Function spawned successfully!');

    if (!response.ok) {
      throw new Error(
        `Edge function returned non-OK status: ${response.status} ${response.statusText}`
      );
    }
  }

  private extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }

  private setupShutdownHandler(): void {
    globalThis.onbeforeunload = async () => {
      this.logger.debug('Shutting down...');

      if (this.worker) {
        await this.spawnNewEdgeFunction();
      }

      await this.stopWorker();
    };
  }

  /**
   * Supabase EdgeRuntime exposes waitUntil method as a way to extend
   * the lifetime of the function until the promise resolves.
   *
   * We leverage this to extend the lifetime to the absolute maximum,
   * by passing a promise that never resolves.
   */
  private extendLifetimeOfEdgeFunction(): void {
    // EdgeRuntime is only available in the actual Supabase Edge Runtime, not in tests
    if (typeof EdgeRuntime !== 'undefined') {
      const promiseThatNeverResolves = new Promise(() => {});
      EdgeRuntime.waitUntil(promiseThatNeverResolves);
    }
  }

  private setupStartupHandler(createWorkerFn: CreateWorkerFn): void {
    Deno.serve({}, (req: Request) => {
      this.logger.debug(`HTTP Request: ${this.edgeFunctionName}`);

      if (!this.worker) {
        this.edgeFunctionName = this.extractFunctionName(req);

        const workerId = this.getEnvVarOrThrow('SB_EXECUTION_ID');

        this.loggingFactory.setWorkerId(workerId);

        // Create the worker using the factory function and the logger
        this.worker = createWorkerFn(this.loggingFactory.createLogger);
        this.worker.startOnlyOnce({
          edgeFunctionName: this.edgeFunctionName,
          workerId,
        });
      }

      return new Response('ok', {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }
}