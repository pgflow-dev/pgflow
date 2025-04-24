import type { Json } from './core/types.js';
import {
  createQueueWorker,
  type QueueWorkerConfig,
} from './queue/createQueueWorker.js';
import {
  createFlowWorker,
  type FlowWorkerConfig,
} from './flow/createFlowWorker.js';
import { createAdapter } from './platform/createAdapter.js';
import type { PlatformAdapter } from './platform/types.js';
import type { MessageHandlerFn } from './queue/types.js';
import type { AnyFlow } from '@pgflow/dsl';

/**
 * Configuration options for the EdgeWorker.
 */
export type EdgeWorkerConfig =
  | Omit<QueueWorkerConfig, 'sql'>
  | Omit<FlowWorkerConfig, 'sql'>;

/**
 * EdgeWorker is the main entry point for creating and starting edge workers.
 *
 * It provides a simple interface for starting a worker that processes messages from a queue
 * or executes steps in a flow.
 *
 * @example
 * ```typescript
 * // Queue worker example
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
 *
 * // Flow worker example
 * import { EdgeWorker } from '@pgflow/edge-worker';
 * import { MyFlow } from './flows.js';
 *
 * EdgeWorker.start(MyFlow, {
 *   maxConcurrent: 5
 * });
 * ```
 */
export class EdgeWorker {
  private static platform: PlatformAdapter | null = null;
  private static wasCalled = false;

  /**
   * Start the EdgeWorker with a message handler function.
   *
   * @param handler - Function that processes each message from the queue
   * @param config - Configuration options for the queue worker
   */
  static async start<TPayload extends Json = Json>(
    handler: MessageHandlerFn<TPayload>,
    config?: Omit<QueueWorkerConfig, 'sql'>
  ): Promise<PlatformAdapter>;

  /**
   * Start the EdgeWorker with a flow instance.
   *
   * @param flow - Flow instance that defines the workflow to execute
   * @param config - Configuration options for the flow worker
   */
  static async start<TFlow extends AnyFlow>(
    flow: TFlow,
    config?: Omit<FlowWorkerConfig, 'sql'>
  ): Promise<PlatformAdapter>;

  /**
   * Implementation of the start method that handles both function and flow cases.
   * This method automatically detects the type of the first argument and delegates
   * to the appropriate worker creation method.
   *
   * @param handlerOrFlow - Either a message handler function or a Flow instance
   * @param config - Configuration options for the worker
   */
  static async start<
    TPayload extends Json = Json,
    TFlow extends AnyFlow = AnyFlow
  >(
    handlerOrFlow: MessageHandlerFn<TPayload> | TFlow,
    config: EdgeWorkerConfig = {}
  ): Promise<PlatformAdapter> {
    if (typeof handlerOrFlow === 'function') {
      return await this.startQueueWorker(
        handlerOrFlow as MessageHandlerFn<TPayload>,
        config as QueueWorkerConfig
      );
    } else {
      return await this.startFlowWorker(
        handlerOrFlow as TFlow,
        config as FlowWorkerConfig
      );
    }
  }

  /**
   * Start the EdgeWorker with the given message handler and configuration.
   *
   * @param handler - Function that processes each message from the queue
   * @param config - Configuration options for the worker
   *
   * @example
   * ```typescript
   * EdgeWorker.startQueueWorker(handler, {
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
  static async startQueueWorker<TPayload extends Json = Json>(
    handler: MessageHandlerFn<TPayload>,
    config: QueueWorkerConfig = {}
  ) {
    this.ensureFirstCall();

    // First, create the adapter
    this.platform = await createAdapter();

    // Apply default values to the config
    const workerConfig: QueueWorkerConfig = {
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

    await this.platform.startWorker((createLoggerFn) => {
      return createQueueWorker(handler, workerConfig, createLoggerFn);
    });

    return this.platform;
  }

  /**
   * Start the EdgeWorker with the given flow instance and configuration.
   *
   * @param flow - Flow instance that defines the workflow to execute
   * @param config - Configuration options for the worker
   *
   * @example
   * ```typescript
   * EdgeWorker.startFlowWorker(MyFlow, {
   *   // how many tasks are processed at the same time
   *   maxConcurrent: 10,
   *
   *   // how many connections to the database are opened
   *   maxPgConnections: 4,
   *
   *   // batch size for polling messages
   *   batchSize: 10,
   * });
   * ```
   */
  static async startFlowWorker<TFlow extends AnyFlow>(
    flow: TFlow,
    config: FlowWorkerConfig = {}
  ) {
    this.ensureFirstCall();

    // First, create the adapter
    this.platform = await createAdapter();

    // Apply default values to the config
    const workerConfig: FlowWorkerConfig = {
      ...config,
      maxConcurrent: config.maxConcurrent ?? 10,
      maxPgConnections: config.maxPgConnections ?? 4,
      batchSize: config.batchSize ?? 10,
      connectionString:
        config.connectionString || this.platform.getConnectionString(),
    };

    await this.platform.startWorker((createLoggerFn) => {
      return createFlowWorker(flow, workerConfig, createLoggerFn);
    });

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
      throw new Error('EdgeWorker worker can only be started once');
    }
    this.wasCalled = true;
  }
}
