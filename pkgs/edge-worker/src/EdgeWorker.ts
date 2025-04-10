import type { Worker } from './core/Worker.js';
import type { Json } from './core/types.js';
import {
  createQueueWorker,
  type QueueWorkerConfig,
} from './queue/createQueueWorker.js';
import { createAdapter } from './platform/createAdapter.js';
import type { PlatformAdapter } from './platform/types.js';

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
  private static adapter: PlatformAdapter | null = null;
  private static worker: Worker | null = null;
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
    handler: (message: TPayload) => Promise<void> | void,
    config: EdgeWorkerConfig = {}
  ) {
    this.ensureFirstCall();
    
    // Initialize the platform adapter
    await this.initializeAdapter();
    
    // Get logger from adapter
    const logger = this.adapter!.createLogger('EdgeWorker');
    
    // Get environment info
    const env = this.adapter!.getEnv();
    
    // Complete the config with environment information
    const completeConfig: EdgeWorkerConfig = {
      ...config,
      queueName: config.queueName || 'tasks',
      maxConcurrent: config.maxConcurrent ?? 10,
      maxPgConnections: config.maxPgConnections ?? 4,
      maxPollSeconds: config.maxPollSeconds ?? 5,
      pollIntervalMs: config.pollIntervalMs ?? 200,
      retryDelay: config.retryDelay ?? 5,
      retryLimit: config.retryLimit ?? 5,
      visibilityTimeout: config.visibilityTimeout ?? 3,
      connectionString: config.connectionString || env.connectionString,
    };
    
    logger.info(`Creating queue worker for ${completeConfig.queueName}`);
    
    // Create worker with the adapter's createLogger function
    this.worker = createQueueWorker(
      handler, 
      completeConfig,
      (module: string) => this.adapter!.createLogger(module)
    );
    
    // Set worker reference in adapter if it supports it
    if ('setWorker' in this.adapter!) {
      (this.adapter as any).setWorker(this.worker);
    }
    
    // For Deno, set up shutdown handler if adapter supports it
    if ('setupShutdownHandler' in this.adapter!) {
      (this.adapter as any).setupShutdownHandler();
    }
    
    // Start worker if needed
    if ('startOnlyOnce' in this.worker) {
      const edgeFunctionName = 'edgeFunctionName' in this.adapter! ? 
        (this.adapter as any).edgeFunctionName || '' : '';
        
      await this.worker.startOnlyOnce({
        edgeFunctionName,
        workerId: env.executionId,
      });
    }
    
    return this.worker;
  }
  
  /**
   * Stop the EdgeWorker and clean up resources.
   */
  static async stop() {
    if (this.worker) {
      await this.worker.stop();
      this.worker = null;
    }
    
    if (this.adapter) {
      await this.adapter.terminate();
      this.adapter = null;
    }
  }
  
  private static ensureFirstCall() {
    if (this.wasCalled) {
      throw new Error('EdgeWorker.start() can only be called once');
    }
    this.wasCalled = true;
  }
  
  private static async initializeAdapter() {
    this.adapter = await createAdapter();
  }
}
