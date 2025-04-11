import type {
  CreateWorkerFn,
  Logger,
  PlatformAdapter,
  PlatformEnvironment,
} from './types.js';
import type { Worker } from '../core/Worker.js';
import './deno-types.js';
import { createLoggingFactory } from './logging.js';

/**
 * Adapter for Deno runtime environment
 */
export class DenoAdapter implements PlatformAdapter {
  private env: PlatformEnvironment;
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

    this.env = this.detectEnvironment();

    // Set initial log level
    this.loggingFactory.setLogLevel(this.env.logLevel || 'info');

    // Initialize logger with a default module name
    this.logger = this.loggingFactory.createLogger('DenoAdapter');
  }

  async initialize(createWorkerFn: CreateWorkerFn): Promise<void> {
    this.setupShutdownHandler();

    // Set up HTTP listener for Deno
    Deno.serve({}, (req: Request) => {
      if (!this.worker) {
        this.edgeFunctionName = this.extractFunctionName(req);

        // Update the workerId for all loggers
        this.loggingFactory.setWorkerId(this.env.executionId);

        this.logger.info(`HTTP Request: ${this.edgeFunctionName}`);

        // Create the worker using the factory function and the logger
        this.worker = createWorkerFn(this.loggingFactory.createLogger);
        this.worker.startOnlyOnce({
          edgeFunctionName: this.edgeFunctionName,
          workerId: this.env.executionId,
        });
      }

      return new Response('ok', {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // Keep function alive for Supabase Edge Functions
    const promiseThatNeverResolves = new Promise(() => {});
    EdgeRuntime.waitUntil(promiseThatNeverResolves);
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.stop();
    }
  }

  getEnv(): PlatformEnvironment {
    return this.env;
  }

  createLogger(module: string): Logger {
    return this.loggingFactory.createLogger(module);
  }

  async spawnNewEdgeFunction(): Promise<void> {
    if (!this.edgeFunctionName) {
      throw new Error('functionName cannot be null or empty');
    }

    const logger = this.loggingFactory.createLogger('spawnNewEdgeFunction');
    logger.debug('Spawning a new Edge Function...');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') as string;

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${this.edgeFunctionName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.debug('Edge Function spawned successfully!');

    if (!response.ok) {
      throw new Error(
        `Edge function returned non-OK status: ${response.status} ${response.statusText}`
      );
    }
  }

  private detectEnvironment(): PlatformEnvironment {
    const connectionString = Deno.env.get('EDGE_WORKER_DB_URL');
    if (!connectionString) {
      const message =
        'EDGE_WORKER_DB_URL is not set!\n' +
        'See https://pgflow.pages.dev/edge-worker/prepare-environment/#prepare-connection-string';
      throw new Error(message);
    }

    const executionId = Deno.env.get('SB_EXECUTION_ID');

    if (!executionId) {
      throw new Error('SB_EXECUTION_ID is not set!');
    }

    return {
      executionId,
      logLevel: Deno.env.get('EDGE_WORKER_LOG_LEVEL') || 'info',
      connectionString,
    };
  }

  private extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }

  setupShutdownHandler(): void {
    globalThis.onbeforeunload = async () => {
      this.logger.info('Shutting down...');
      if (this.worker && this.edgeFunctionName) {
        await this.spawnNewEdgeFunction();
      }

      await this.terminate();
    };
  }
}
