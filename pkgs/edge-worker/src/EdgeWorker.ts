import type { Worker } from './core/Worker.js';
import spawnNewEdgeFunction from './spawnNewEdgeFunction.js';
import type { Json } from './core/types.js';
import { getLogger, setupLogger } from './core/Logger.js';
import {
  createQueueWorker,
  type QueueWorkerConfig,
} from './queue/createQueueWorker.js';

/**
 * Configuration options for the EdgeWorker.
 */
export type EdgeWorkerConfig = QueueWorkerConfig;

/**
 * EdgeWorker is the main entry point for creating and starting edge workers.
 *
 * It provides a simple interface for starting a worker that processes messages from a queue.
 *
 * @example
 * ```typescript
 * import { EdgeWorker } from '@pgflow/edge-worker';
 *
 * EdgeWorker.start(async (message) => {
 *   // Process the message
 *   console.log('Processing message:', message);
 * }, {
 *   queueName: 'my-queue',
 *   maxConcurrent: 5,
 *   retryLimit: 3
 * });
 * ```
 */
export class EdgeWorker {
  private static logger = getLogger('EdgeWorker');
  private static wasCalled = false;

  /**
   * Start the EdgeWorker with the given message handler and configuration.
   *
   * @param handler - Function that processes each message from the queue
   * @param config - Configuration options for the worker
   *
   * @example
   * ```typescript
   * EdgeWorker.start(handler, {
   *   // name of the queue to poll for messages
   *   queueName: 'tasks',
   *
   *   // how many tasks are processed at the same time
   *   maxConcurrent: 10,
   *
   *   // how many connections to the database are opened
   *   maxPgConnections: 4,
   *
   *   // in-worker polling interval
   *   maxPollSeconds: 5,
   *
   *   // in-database polling interval
   *   pollIntervalMs: 200,
   *
   *   // how long to wait before retrying a failed job
   *   retryDelay: 5,
   *
   *   // how many times to retry a failed job
   *   retryLimit: 5,
   *
   *   // how long a job is invisible after reading
   *   // if not successful, will reappear after this time
   *   visibilityTimeout: 3,
   * });
   * ```
   */
  static start<TPayload extends Json = Json>(
    handler: (message: TPayload) => Promise<void> | void,
    config: EdgeWorkerConfig = {}
  ) {
    this.ensureFirstCall();

    // Get connection string from config or environment
    const connectionString =
      config.connectionString || this.getConnectionString();

    // Create a complete configuration object with defaults
    const completeConfig: EdgeWorkerConfig = {
      // Pass through any config options first
      ...config,

      // Then override with defaults for missing values
      queueName: config.queueName || 'tasks',
      maxConcurrent: config.maxConcurrent ?? 10,
      maxPgConnections: config.maxPgConnections ?? 4,
      maxPollSeconds: config.maxPollSeconds ?? 5,
      pollIntervalMs: config.pollIntervalMs ?? 200,
      retryDelay: config.retryDelay ?? 5,
      retryLimit: config.retryLimit ?? 5,
      visibilityTimeout: config.visibilityTimeout ?? 3,

      // Ensure connectionString is always set
      connectionString,
    };

    this.setupRequestHandler(handler, completeConfig);
  }

  private static ensureFirstCall() {
    if (this.wasCalled) {
      throw new Error('EdgeWorker.start() can only be called once');
    }
    this.wasCalled = true;
  }

  private static getConnectionString(): string {
    const connectionString = Deno.env.get('EDGE_WORKER_DB_URL');
    if (!connectionString) {
      const message =
        'EDGE_WORKER_DB_URL is not set!\n' +
        'See https://pgflow.pages.dev/edge-worker/prepare-environment/#prepare-connection-string';
      throw new Error(message);
    }
    return connectionString;
  }

  private static setupShutdownHandler(worker: Worker) {
    globalThis.onbeforeunload = async () => {
      if (worker.edgeFunctionName) {
        await spawnNewEdgeFunction(worker.edgeFunctionName);
      }

      worker.stop();
    };

    // use waitUntil to prevent the function from exiting
    // For Supabase Edge Functions environment
    const promiseThatNeverResolves = new Promise(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
    EdgeRuntime.waitUntil(promiseThatNeverResolves);
  }

  private static setupRequestHandler<TPayload extends Json>(
    handler: (message: TPayload) => Promise<void> | void,
    workerConfig: EdgeWorkerConfig
  ) {
    let worker: Worker | null = null;

    Deno.serve({}, (req) => {
      if (!worker) {
        const edgeFunctionName = this.extractFunctionName(req);
        const sbExecutionId = Deno.env.get('SB_EXECUTION_ID')!;
        setupLogger(sbExecutionId);

        this.logger.info(`HTTP Request: ${edgeFunctionName}`);
        // Create the worker with all configuration options

        worker = createQueueWorker(handler, workerConfig);
        worker.startOnlyOnce({
          edgeFunctionName,
          workerId: sbExecutionId,
        });

        this.setupShutdownHandler(worker);
      }

      return new Response('ok', {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  private static extractFunctionName(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+|\/+$/g, '');
  }
}
