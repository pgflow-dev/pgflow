import type {
  CreateWorkerFn,
  Logger,
  PlatformAdapter,
  PlatformEnvironment,
} from './types.js';
import './deno-types.js';

/**
 * Adapter for Deno runtime environment
 */
export class DenoAdapter implements PlatformAdapter {
  private env: PlatformEnvironment | null = null;
  private edgeFunctionName: string | null = null;
  private worker: { stop(): void } | null = null;

  constructor() {
    // Guard clause to ensure we're in a Deno environment
    // This is just for type checking during build
    // At runtime, this class should only be instantiated in Deno
    if (typeof Deno === 'undefined' || typeof EdgeRuntime === 'undefined') {
      throw new Error(
        'DenoAdapter created in non-Deno environment - this is expected during build only'
      );
    }
  }

  async initialize(createWorkerFn: CreateWorkerFn): Promise<void> {
    // Get environment information
    this.env = this.detectEnvironment();

    // Set up HTTP listener for Deno
    Deno.serve({}, (req: Request) => {
      if (!this.worker) {
        this.edgeFunctionName = this.extractFunctionName(req);

        // Create a logger for the adapter
        const logger = this.createLogger('DenoAdapter');
        logger.info(`HTTP Request: ${this.edgeFunctionName}`);

        // Create the worker using the factory function and the logger
        this.worker = createWorkerFn(this.createLogger.bind(this));
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
      this.worker.stop();
      this.worker = null;
    }
  }

  getEnv(): PlatformEnvironment {
    if (!this.env) throw new Error('Adapter not initialized');
    return this.env;
  }

  createLogger(module: string): Logger {
    const workerId = this.env?.executionId || 'unknown';
    const logLevel = this.env?.logLevel || 'info';

    // Simple level filtering
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const levelValue = levels[logLevel as keyof typeof levels] ?? levels.info;

    return {
      debug: (message, ...args) => {
        if (levelValue >= levels.debug) {
          console.debug(
            `worker_id=${workerId} module=${module} ${message}`,
            ...args
          );
        }
      },
      info: (message, ...args) => {
        if (levelValue >= levels.info) {
          console.info(
            `worker_id=${workerId} module=${module} ${message}`,
            ...args
          );
        }
      },
      warn: (message, ...args) => {
        if (levelValue >= levels.warn) {
          console.warn(
            `worker_id=${workerId} module=${module} ${message}`,
            ...args
          );
        }
      },
      error: (message, ...args) => {
        if (levelValue >= levels.error) {
          console.error(
            `worker_id=${workerId} module=${module} ${message}`,
            ...args
          );
        }
      },
    };
  }

  setWorker(worker: { stop(): void }): void {
    this.worker = worker;
  }

  async spawnNewEdgeFunction(functionName: string): Promise<void> {
    if (!functionName) {
      throw new Error('functionName cannot be null or empty');
    }

    const logger = this.createLogger('spawnNewEdgeFunction');
    logger.debug('Spawning a new Edge Function...');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') as string;

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${functionName}`,
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

    return {
      executionId: Deno.env.get('SB_EXECUTION_ID'),
      logLevel: Deno.env.get('EDGE_WORKER_LOG_LEVEL') || 'info',
      connectionString,
    };
  }

  private extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }

  setupShutdownHandler(): void {
    globalThis.onbeforeunload = async () => {
      if (this.worker && this.edgeFunctionName) {
        await this.spawnNewEdgeFunction(this.edgeFunctionName);
      }

      if (this.worker) {
        this.worker.stop();
        this.worker = null;
      }
    };
  }
}
