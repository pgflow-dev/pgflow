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
import type {
  AnyFlow,
  CompatibleFlow,
  StepQueuedFlow,
} from '@pgflow/dsl';
import { isStepQueuedFlow } from '@pgflow/dsl';
import type { CurrentPlatformResources } from './types/currentPlatform.js';
import type { StepWorkerConfig } from './core/workerConfigTypes.js';
import { resolveWorkerRouting } from './flow/workerRouting.js';


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
  private static platform: PlatformAdapter<CurrentPlatformResources> | null = null;
  private static wasCalled = false;

  /**
   * Start the EdgeWorker with a message handler function.
   *
   * @param handler - Function that processes each message from the queue
   * @param config - Configuration options for the queue worker
   */
  static async start<TPayload extends Json = Json>(
    handler: MessageHandlerFn<TPayload>,
    config?: QueueWorkerConfig
  ): Promise<PlatformAdapter<CurrentPlatformResources>>;

  /**
   * Start the EdgeWorker for one step of a withStepQueues() flow (#651).
   *
   * Start one worker per selected step, in separate entry points or
   * processes; `EdgeWorker.start()` remains once per process or Edge
   * Function. The stepSlug is validated at runtime before adapter creation
   * or database startup.
   *
   * @param flow - StepQueuedFlow wrapper produced by withStepQueues()
   * @param config - Configuration options; stepSlug selects the polled step
   */
  static async start<TFlow extends AnyFlow>(
    flow: StepQueuedFlow<CompatibleFlow<TFlow, CurrentPlatformResources>>,
    config: StepWorkerConfig<TFlow>
  ): Promise<PlatformAdapter<CurrentPlatformResources>>;

  /**
   * Start the EdgeWorker with a flow instance.
   *
   * @param flow - Flow instance that defines the workflow to execute
   * @param config - Configuration options for the flow worker
   */
  static async start<TFlow extends AnyFlow>(
    flow: CompatibleFlow<TFlow, CurrentPlatformResources>,
    config?: FlowWorkerConfig
  ): Promise<PlatformAdapter<CurrentPlatformResources>>;

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
    handlerOrFlow:
      | MessageHandlerFn<TPayload>
      | TFlow
      | StepQueuedFlow<TFlow>,
    config?: QueueWorkerConfig | FlowWorkerConfig | StepWorkerConfig<TFlow>
  ): Promise<PlatformAdapter<CurrentPlatformResources>> {
    if (typeof handlerOrFlow === 'function') {
      return await this.startQueueWorker(
        handlerOrFlow as MessageHandlerFn<TPayload>,
        config as QueueWorkerConfig | undefined
      );
    } else if (isStepQueuedFlow(handlerOrFlow as TFlow | StepQueuedFlow<TFlow>)) {
      // Route to the correlated step-worker overload; a missing stepSlug is
      // rejected at runtime by resolveWorkerRouting before adapter creation
      // (#651).
      return await this.startFlowWorker(
        handlerOrFlow as StepQueuedFlow<
          CompatibleFlow<TFlow, CurrentPlatformResources>
        >,
        config as StepWorkerConfig<TFlow>
      );
    } else {
      return await this.startFlowWorker(
        handlerOrFlow as CompatibleFlow<TFlow, CurrentPlatformResources>,
        config as FlowWorkerConfig | undefined
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
   *   visibilityTimeout: 10,
   * });
   * ```
   */
  static async startQueueWorker<TPayload extends Json = Json>(
    handler: MessageHandlerFn<TPayload>,
    config: QueueWorkerConfig = {}
  ): Promise<PlatformAdapter<CurrentPlatformResources>> {
    this.ensureFirstCall();

    // Create the adapter with connection options
    const platform = await createAdapter({
      sql: config.sql,
      connectionString: config.connectionString,
      maxPgConnections: config.maxPgConnections,
    });
    this.platform = platform;

    // Use platform's SQL for unified connection
    const workerConfig: QueueWorkerConfig = {
      ...config,
      sql: platform.platformResources.sql,
      connectionString: platform.connectionString,
      env: platform.env,
    };

    await platform.startWorker((createLoggerFn) => {
      return createQueueWorker(handler, workerConfig, createLoggerFn, platform);
    });

    return platform;
  }

  /**
   * Start the EdgeWorker for one step of a withStepQueues() flow (#651).
   *
   * Correlated public overload of startFlowWorker: stepSlug autocompletes
   * from the wrapped flow's exact step union and is required; unknown values
   * are rejected at runtime before adapter creation or database startup.
   * One call per process or Edge Function, one step per entry point.
   *
   * @param flow - StepQueuedFlow wrapper produced by withStepQueues()
   * @param config - Configuration options; stepSlug selects the polled step
   */
  static async startFlowWorker<TFlow extends AnyFlow>(
    flow: StepQueuedFlow<CompatibleFlow<TFlow, CurrentPlatformResources>>,
    config: StepWorkerConfig<TFlow>
  ): Promise<PlatformAdapter<CurrentPlatformResources>>;

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
   *
   *   // in-worker polling interval
   *   maxPollSeconds: 2,
   *
   *   // in-database polling interval
   *   pollIntervalMs: 100,
   * });
   * ```
   */
  static async startFlowWorker<TFlow extends AnyFlow>(
    flow: CompatibleFlow<TFlow, CurrentPlatformResources>,
    config?: FlowWorkerConfig
  ): Promise<PlatformAdapter<CurrentPlatformResources>>;

  static async startFlowWorker<TFlow extends AnyFlow>(
    flow: CompatibleFlow<TFlow, CurrentPlatformResources> |
      StepQueuedFlow<CompatibleFlow<TFlow, CurrentPlatformResources>>,
    config: FlowWorkerConfig | StepWorkerConfig<TFlow> = {}
  ): Promise<PlatformAdapter<CurrentPlatformResources>> {
    this.ensureFirstCall();

    // Validate step-selector routing before adapter creation or any database
    // work: a plain flow rejects stepSlug; a step-queued flow requires a
    // stepSlug from its checked route snapshot (#651).
    resolveWorkerRouting(
      flow as TFlow | StepQueuedFlow<TFlow>,
      (config as StepWorkerConfig<TFlow>).stepSlug
    );

    // Create the adapter with connection options
    const platform = await createAdapter({
      sql: (config as FlowWorkerConfig).sql,
      connectionString: (config as FlowWorkerConfig).connectionString,
      maxPgConnections: (config as FlowWorkerConfig).maxPgConnections,
    });
    this.platform = platform;

    // Use platform's SQL for unified connection
    const workerConfig: FlowWorkerConfig = {
      ...(config as FlowWorkerConfig),
      sql: platform.platformResources.sql,
      connectionString: platform.connectionString,
    };

    await platform.startWorker((createLoggerFn) => {
      return createFlowWorker(
        flow as TFlow | StepQueuedFlow<TFlow>,
        workerConfig as FlowWorkerConfig,
        createLoggerFn,
        platform
      );
    });

    return platform;
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
