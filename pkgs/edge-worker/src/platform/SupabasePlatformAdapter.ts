import type { CreateWorkerFn, Logger, PlatformAdapter } from './types.js';
import type { Worker } from '../core/Worker.js';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseResources } from '@pgflow/dsl/supabase';
import { createSql } from '../core/sql-factory.js';
import { createServiceSupabaseClient } from '../core/supabase-utils.js';
import { createLoggingFactory } from './logging.js';

/**
 * Worker start time - stored at module level to track when the Edge Function was loaded
 * This is used for staleness detection in the /metadata endpoint
 */
const WORKER_START_TIME = new Date();

/**
 * Supabase Edge Runtime type (without global augmentation to comply with JSR)
 */
interface EdgeRuntimeType {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Supabase-specific environment variables
 */
interface SupabaseEnv extends Record<string, string | undefined> {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EDGE_WORKER_DB_URL: string;
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
  private flowMetadata: Record<string, { sql: string[] }> = {};

  // Logging factory with dynamic workerId support
  private loggingFactory = createLoggingFactory();

  constructor() {
    // Validate environment variables once at startup
    const env = Deno.env.toObject();
    this.assertSupabaseEnv(env);
    this.validatedEnv = env;
    
    // Create abort controller for shutdown signal
    this.abortController = new AbortController();
    
    // Set initial log level
    const logLevel = this.validatedEnv.EDGE_WORKER_LOG_LEVEL || 'info';
    this.loggingFactory.setLogLevel(logLevel);

    // startWorker logger with a default module name
    this.logger = this.loggingFactory.createLogger('SupabasePlatformAdapter');
    this.logger.debug('SupabasePlatformAdapter logger instance created and working.'); // Use the created logger
    
    // Initialize platform resources once with validated env
    this._platformResources = {
      sql: createSql(this.validatedEnv),
      supabase: createServiceSupabaseClient(this.validatedEnv)
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
  get connectionString(): string {
    return this.validatedEnv.EDGE_WORKER_DB_URL;
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

  /**
   * Set flow metadata for the /metadata endpoint
   * This is used by EdgeWorker.startFlowWorker to register the flow
   */
  setFlowMetadata(flowMetadata: Record<string, { sql: string[] }>): void {
    this.flowMetadata = flowMetadata;
  }

  private async spawnNewEdgeFunction(): Promise<void> {
    if (!this.edgeFunctionName) {
      throw new Error('functionName cannot be null or empty');
    }

    const supabaseUrl = this.validatedEnv.SUPABASE_URL;

    this.logger.debug('Spawning a new Edge Function...');

    const response = await fetch(
      `${supabaseUrl}/functions/v1/${this.edgeFunctionName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.validatedEnv.SUPABASE_ANON_KEY}`,
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
    // EdgeRuntime is available in Supabase Edge Functions runtime
    const promiseThatNeverResolves = new Promise(() => {
      // Intentionally empty - this promise never resolves to extend function lifetime
    });
    (globalThis as typeof globalThis & { EdgeRuntime: EdgeRuntimeType }).EdgeRuntime.waitUntil(promiseThatNeverResolves);
  }

  private setupStartupHandler(createWorkerFn: CreateWorkerFn): void {
    Deno.serve({}, (req: Request) => {
      const url = new URL(req.url);
      const path = url.pathname;

      // Handle /metadata endpoint - returns metadata without starting worker
      if (path.endsWith('/metadata') && req.method === 'GET') {
        return this.handleMetadataRequest();
      }

      // All other paths trigger worker startup
      this.logger.debug(`HTTP Request: ${this.edgeFunctionName}`);

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

      return new Response('ok', {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  /**
   * Handle GET /metadata endpoint
   * Returns worker and flow metadata without starting the worker
   */
  private handleMetadataRequest(): Response {
    // If worker not initialized yet, return 503
    if (!this.worker) {
      return new Response(
        JSON.stringify({
          error: 'worker_not_ready',
          message: 'Worker is starting up, try again in a moment',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Build metadata response
    const metadata = {
      worker: {
        worker_id: this.validatedEnv.SB_EXECUTION_ID,
        started_at: WORKER_START_TIME.toISOString(),
      },
      flows: this.flowMetadata,
    };

    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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
      'EDGE_WORKER_DB_URL',
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