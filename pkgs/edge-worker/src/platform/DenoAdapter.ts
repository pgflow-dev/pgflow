/// <reference types="deno/full.d.ts" />

import type { CreateWorkerFn, Logger, PlatformAdapter } from './types.js';
import type { Worker } from '../core/Worker.js';
import './deno-types.js';
import { createLoggingFactory } from './logging.js';

/**
 * Adapter for Deno runtime environment
 */
export class DenoAdapter implements PlatformAdapter {
  private edgeFunctionName: string | null = null;
  private worker: Worker | null = null;
  private logger: Logger;

  // Logging factory with dynamic workerId support
  private loggingFactory = createLoggingFactory();

  constructor() {
    // Guard clause to ensure we're in a Deno environment
    // This is just for type checking during build
    // At runtime, this class should only be instantiated in Deno
    if (typeof Deno === 'undefined' || typeof EdgeRuntime === 'undefined') {
      throw new Error(
        'DenoAdapter created in non-Deno environment - this is expected during build only'
      );
    }

    // Set initial log level
    const logLevel = this.getEnvVarOrThrow('EDGE_WORKER_LOG_LEVEL') || 'info';
    this.loggingFactory.setLogLevel(logLevel);

    // startWorker logger with a default module name
    this.logger = this.loggingFactory.createLogger('DenoAdapter');
  }

  /**
   * startWorker the platform adapter with a worker factory function
   * @param createWorkerFn Function that creates a worker instance when called with a logger
   */
  async startWorker(createWorkerFn: CreateWorkerFn): Promise<void> {
    this.extendLifetimeOfEdgeFunction();
    this.setupShutdownHandler();
    this.setupStartupHandler(createWorkerFn);
  }

  async stopWorker(): Promise<void> {
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
  getConnectionString(): string {
    return this.getEnvVarOrThrow('EDGE_WORKER_DB_URL');
  }

  /**
   * Get the Supabase URL for the current environment
   */
  private getEnvVarOrThrow(name: string): string {
    const envVar = Deno.env.get(name);

    if (!envVar) {
      const message =
        `${name} is not set!\n` +
        'See docs to learn how to prepare the environment:\n' +
        'https://pgflow.pages.dev/edge-worker/prepare-environment';
      throw new Error(message);
    }

    return envVar;
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
      this.logger.info('Shutting down...');

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
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const promiseThatNeverResolves = new Promise(() => {});
    EdgeRuntime.waitUntil(promiseThatNeverResolves);
  }

  private setupStartupHandler(createWorkerFn: CreateWorkerFn): void {
    Deno.serve({}, (req: Request) => {
      this.logger.info(`HTTP Request: ${this.edgeFunctionName}`);

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
