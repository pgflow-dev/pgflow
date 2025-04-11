import type { Json } from './core/types.js';
import {
  createQueueWorker,
  type QueueWorkerConfig,
} from './queue/createQueueWorker.js';
import { createAdapter } from './platform/createAdapter.js';
import type { PlatformAdapter } from './platform/types.js';
import { MessageHandlerFn } from './queue/types.js';

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
  private static platform: PlatformAdapter | null = null;
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
  static async start<TPayload extends Json = Json>(
    handler: MessageHandlerFn<TPayload>,
    config: EdgeWorkerConfig = {}
  ) {
    this.ensureFirstCall();

    // First, create the adapter
    this.platform = await createAdapter();

    // Apply default values to the config
    const workerConfig: EdgeWorkerConfig = {
      ...config,
      queueName: config.queueName || 'tasks',
      maxConcurrent: config.maxConcurrent ?? 10,
      maxPgConnections: config.maxPgConnections ?? 4,
      maxPollSeconds: config.maxPollSeconds ?? 5,
      pollIntervalMs: config.pollIntervalMs ?? 200,
      retryDelay: config.retryDelay ?? 5,
      retryLimit: config.retryLimit ?? 5,
      visibilityTimeout: config.visibilityTimeout ?? 3,
      connectionString:
        config.connectionString || this.platform.getConnectionString(),
    };

    await this.platform.startWorker((createLoggerFn) =>
      createQueueWorker(handler, workerConfig, createLoggerFn)
    );

    return this.platform;
  }

  /**
   * Stop the EdgeWorker and clean up resources.
   */
  static async stop() {
    if (this.platform) {
      await this.platform.stopWorker();
    } else {
      throw new Error('EdgeWorker.start() must be called first');
    }
  }

  private static ensureFirstCall() {
    if (this.wasCalled) {
      throw new Error('EdgeWorker.start() can only be called once');
    }
    this.wasCalled = true;
  }
}
