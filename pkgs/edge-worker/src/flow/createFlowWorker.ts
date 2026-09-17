import type { AnyFlow, FlowContext, StepQueuedFlow } from '@pgflow/dsl';
import { ExecutionController } from '../core/ExecutionController.js';
import { StepTaskPoller, type StepTaskPollerConfig } from './StepTaskPoller.js';
import { StepTaskExecutor, type WorkerIdentity } from './StepTaskExecutor.js';
import { FlowInputProvider } from './FlowInputProvider.js';
import { PgflowSqlClient } from '@pgflow/core';
import { Queries } from '../core/Queries.js';
import type { IExecutor } from '../core/types.js';
import type { Logger, PlatformAdapter } from '../platform/types.js';
import type {
  StepTaskWithMessage,
  StepTaskHandlerContext,
} from '../core/context.js';
import { createContextSafeConfig } from '../core/context.js';
import { Worker } from '../core/Worker.js';
import postgres from 'postgres';
import { FlowWorkerLifecycle } from './FlowWorkerLifecycle.js';
import { BatchProcessor } from '../core/BatchProcessor.js';
import {
  resolveWorkerRouting,
  type WorkerRouting,
} from './workerRouting.js';
import type {
  FlowWorkerConfig,
  ResolvedFlowWorkerConfig,
  StepWorkerConfig,
} from '../core/workerConfigTypes.js';

// Re-export type from workerConfigTypes to maintain backward compatibility
export type { FlowWorkerConfig } from '../core/workerConfigTypes.js';

// Default configuration constants
const DEFAULT_FLOW_CONFIG = {
  maxConcurrent: 10,
  maxPgConnections: 4,
  batchSize: 10,
  visibilityTimeout: 5,
  maxPollSeconds: 2,
  pollIntervalMs: 100,
} as const;

/**
 * Normalizes flow worker configuration by applying all defaults
 */
function normalizeFlowConfig(
  config: FlowWorkerConfig,
  sql: postgres.Sql,
  platformEnv: Record<string, string | undefined>
): ResolvedFlowWorkerConfig {
  return {
    ...DEFAULT_FLOW_CONFIG,
    ...config,
    sql,
    env: platformEnv,
    connectionString: config.connectionString,
  };
}

/**
 * Creates a new Worker instance for processing flow tasks using the two-phase polling approach.
 * This eliminates race conditions by separating message polling from task processing.
 *
 * Accepts a plain Flow (default queue) or a StepQueuedFlow wrapper with a
 * stepSlug in config (#651). Routing is validated synchronously inside this
 * call; EdgeWorker.start() additionally validates before adapter creation.
 *
 * @param flowOrWrapper - The Flow DSL definition or a withStepQueues() wrapper
 * @param config - Configuration options for the worker
 * @param createLogger - Function to create loggers for different modules
 * @param platformAdapter - Platform adapter for creating contexts
 * @returns A configured Worker instance ready to be started
 */
export function createFlowWorker<
  TFlow extends AnyFlow,
  TResources extends Record<string, unknown>
>(
  flowOrWrapper: TFlow | StepQueuedFlow<TFlow>,
  config: FlowWorkerConfig | StepWorkerConfig<TFlow>,
  createLogger: (module: string) => Logger,
  platformAdapter: PlatformAdapter<TResources>
): Worker {
  const logger = createLogger('createFlowWorker');

  // Resolve and validate queue routing before anything else (#651):
  // rejects a stepSlug on a plain flow and a missing/unknown stepSlug on a
  // step-queued flow.
  const routing: WorkerRouting = resolveWorkerRouting(
    flowOrWrapper,
    (config as StepWorkerConfig<TFlow>).stepSlug
  );
  const flow = routing.flow as TFlow;

  // Use platform's shutdown signal
  const abortSignal = platformAdapter.shutdownSignal;

  if (!config.sql && !config.connectionString) {
    throw new Error(
      "Either 'sql' or 'connectionString' must be provided in FlowWorkerConfig."
    );
  }

  const ownsSql = !config.sql;
  const sql =
    config.sql ||
    postgres(config.connectionString as string, {
      max: config.maxPgConnections ?? DEFAULT_FLOW_CONFIG.maxPgConnections,
      prepare: false,
    });

  // Normalize config with all defaults applied ONCE. stepSlug is routing
  // metadata, not worker configuration; it never reaches the resolved config.
  const { stepSlug: _stepSlug, ...workerOnlyConfig } = config as FlowWorkerConfig & {
    stepSlug?: string;
  };
  const resolvedConfig = normalizeFlowConfig(workerOnlyConfig, sql, platformAdapter.env);

  // Create the pgflow adapter
  const pgflowAdapter = new PgflowSqlClient<TFlow>(sql);

  // Canonical queue identity from the resolved routing: the normalized slug
  // in flow mode, or the step's persisted generated queue in step mode (#651).
  // PGMQ message operations normalize names themselves (#650).
  const queueName = routing.queueName;
  logger.debug(`Using queue name: ${queueName}`);

  // Create specialized FlowWorkerLifecycle with the routing and flow
  const queries = new Queries(sql);
  const lifecycle = new FlowWorkerLifecycle<TFlow>(
    queries,
    flow,
    routing,
    createLogger('FlowWorkerLifecycle')
  );

  // Create frozen worker config ONCE for reuse across all task executions
  const frozenWorkerConfig = createContextSafeConfig(resolvedConfig);

  // Create FlowInputProvider for lazy loading and caching flow input
  const flowInputProvider = new FlowInputProvider<TFlow>(sql);

  // Create StepTaskPoller with two-phase approach
  const pollerConfig: StepTaskPollerConfig = {
    batchSize: resolvedConfig.batchSize,
    flowSlug: flow.slug,
    queueName,
    stepSlug: routing.stepSlug,
    visibilityTimeout: resolvedConfig.visibilityTimeout,
    maxPollSeconds: resolvedConfig.maxPollSeconds,
    pollIntervalMs: resolvedConfig.pollIntervalMs,
  };
  // TODO: Pass workerId supplier to defer access until after startup
  const poller = new StepTaskPoller<TFlow>(
    pgflowAdapter,
    abortSignal,
    pollerConfig,
    () => lifecycle.workerId,
    createLogger('StepTaskPoller')
  );

  // Create executor factory with proper typing
  // Note: This factory is only called during task execution (after acknowledgeStart completes),
  // so lifecycle.workerId and lifecycle.edgeFunctionName are guaranteed to be set.
  const executorFactory = (
    taskWithMessage: StepTaskWithMessage<TFlow>,
    signal: AbortSignal
  ): IExecutor => {
    const runId = taskWithMessage.task.run_id;

    // Populate cache if flow_input was provided by SQL (root non-map steps only)
    if (taskWithMessage.flowInput !== null) {
      flowInputProvider.populate(runId, taskWithMessage.flowInput);
    }

    // Build context directly using platform resources
    // flowInput is a Promise that either resolves immediately (cached) or lazy-loads
    const context: FlowContext & TResources = {
      // Core platform resources
      env: platformAdapter.env,
      shutdownSignal: platformAdapter.shutdownSignal,

      // Step task execution context
      rawMessage: taskWithMessage.message,
      stepTask: taskWithMessage.task,
      workerConfig: frozenWorkerConfig, // Reuse cached frozen config
      flowInput: flowInputProvider.get(runId), // Lazy-loaded flow input

      // Platform-specific resources (generic)
      ...platformAdapter.platformResources,
    };

    // Build worker identity for structured logging
    // Safe to access here because factory is only called after acknowledgeStart()
    const workerIdentity: WorkerIdentity = {
      workerId: lifecycle.workerId,
      workerName: lifecycle.edgeFunctionName ?? 'unknown',
      queueName: queueName,
    };

    // Type assertion: FlowContext & TResources is compatible with StepTaskHandlerContext<TFlow>
    // at runtime, but TypeScript needs help due to generic type variance
    return new StepTaskExecutor<TFlow>(
      flow,
      pgflowAdapter,
      signal,
      createLogger('StepTaskExecutor'),
      context as StepTaskHandlerContext<TFlow>,
      workerIdentity
    );
  };

  // Create ExecutionController
  const executionController = new ExecutionController<
    StepTaskWithMessage<TFlow>
  >(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: resolvedConfig.maxConcurrent,
    },
    createLogger('ExecutionController')
  );

  // Create BatchProcessor
  const batchProcessor = new BatchProcessor<StepTaskWithMessage<TFlow>>(
    executionController,
    poller,
    abortSignal,
    createLogger('BatchProcessor')
  );

  // Return Worker
  return new Worker(
    batchProcessor,
    lifecycle,
    createLogger('Worker'),
    {
      requestShutdown: platformAdapter.requestShutdown?.bind(platformAdapter),
      cleanup: ownsSql ? () => sql.end() : undefined,
    }
  );
}
