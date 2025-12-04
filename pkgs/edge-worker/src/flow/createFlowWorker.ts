import type { AnyFlow, FlowContext } from '@pgflow/dsl';
import { ExecutionController } from '../core/ExecutionController.js';
import { StepTaskPoller, type StepTaskPollerConfig } from './StepTaskPoller.js';
import { StepTaskExecutor } from './StepTaskExecutor.js';
import { PgflowSqlClient } from '@pgflow/core';
import { Queries } from '../core/Queries.js';
import type { IExecutor } from '../core/types.js';
import type { Logger, PlatformAdapter } from '../platform/types.js';
import type { StepTaskWithMessage, StepTaskHandlerContext } from '../core/context.js';
import { createContextSafeConfig } from '../core/context.js';
import { Worker } from '../core/Worker.js';
import postgres from 'postgres';
import { FlowWorkerLifecycle } from './FlowWorkerLifecycle.js';
import { BatchProcessor } from '../core/BatchProcessor.js';
import type { FlowWorkerConfig, ResolvedFlowWorkerConfig } from '../core/workerConfigTypes.js';

// Re-export type from workerConfigTypes to maintain backward compatibility
export type { FlowWorkerConfig } from '../core/workerConfigTypes.js';

// Default configuration constants
const DEFAULT_FLOW_CONFIG = {
  maxConcurrent: 10,
  maxPgConnections: 4,
  batchSize: 10,
  visibilityTimeout: 2,
  maxPollSeconds: 2,
  pollIntervalMs: 100,
} as const;

/**
 * Normalizes flow worker configuration by applying all defaults
 */
function normalizeFlowConfig(config: FlowWorkerConfig, sql: postgres.Sql, platformEnv: Record<string, string | undefined>): ResolvedFlowWorkerConfig {
  return {
    ...DEFAULT_FLOW_CONFIG,
    ...config,
    sql,
    env: platformEnv,
    connectionString: config.connectionString
  };
}

/**
 * Creates a new Worker instance for processing flow tasks using the two-phase polling approach.
 * This eliminates race conditions by separating message polling from task processing.
 *
 * @param flow - The Flow DSL definition
 * @param config - Configuration options for the worker
 * @param createLogger - Function to create loggers for different modules
 * @param platformAdapter - Platform adapter for creating contexts
 * @returns A configured Worker instance ready to be started
 */
export function createFlowWorker<TFlow extends AnyFlow, TResources extends Record<string, unknown>>(
  flow: TFlow,
  config: FlowWorkerConfig,
  createLogger: (module: string) => Logger,
  platformAdapter: PlatformAdapter<TResources>
): Worker {
  const logger = createLogger('createFlowWorker');

  // Use platform's shutdown signal
  const abortSignal = platformAdapter.shutdownSignal;

  if (!config.sql && !config.connectionString) {
    throw new Error(
      "Either 'sql' or 'connectionString' must be provided in FlowWorkerConfig."
    );
  }

  const sql =
    config.sql ||
    postgres(config.connectionString as string, {
      max: config.maxPgConnections ?? DEFAULT_FLOW_CONFIG.maxPgConnections,
      prepare: false,
    });

  // Normalize config with all defaults applied ONCE
  const resolvedConfig = normalizeFlowConfig(config, sql, platformAdapter.env);

  // Create the pgflow adapter
  const pgflowAdapter = new PgflowSqlClient<TFlow>(sql);

  // Use flow slug as queue name, or fallback to 'tasks'
  const queueName = flow.slug || 'tasks';
  logger.debug(`Using queue name: ${queueName}`);

  // Create specialized FlowWorkerLifecycle with the proxied queue and flow
  const queries = new Queries(sql);
  const lifecycle = new FlowWorkerLifecycle<TFlow>(
    queries,
    flow,
    createLogger('FlowWorkerLifecycle'),
    {
      ensureCompiledOnStartup: config.ensureCompiledOnStartup ?? true
    }
  );

  // Create frozen worker config ONCE for reuse across all task executions
  const frozenWorkerConfig = createContextSafeConfig(resolvedConfig);

  // Create StepTaskPoller with two-phase approach
  const pollerConfig: StepTaskPollerConfig = {
    batchSize: resolvedConfig.batchSize,
    queueName: flow.slug,
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
  const executorFactory = (
    taskWithMessage: StepTaskWithMessage<TFlow>,
    signal: AbortSignal
  ): IExecutor => {
    // Build context directly using platform resources
    const context: FlowContext & TResources = {
      // Core platform resources
      env: platformAdapter.env,
      shutdownSignal: platformAdapter.shutdownSignal,

      // Step task execution context
      rawMessage: taskWithMessage.message,
      stepTask: taskWithMessage.task,
      workerConfig: frozenWorkerConfig, // Reuse cached frozen config

      // Platform-specific resources (generic)
      ...platformAdapter.platformResources
    };

    // Type assertion: FlowContext & TResources is compatible with StepTaskHandlerContext<TFlow>
    // at runtime, but TypeScript needs help due to generic type variance
    return new StepTaskExecutor<TFlow>(
      flow,
      pgflowAdapter,
      signal,
      createLogger('StepTaskExecutor'),
      context as StepTaskHandlerContext<TFlow>
    );
  };

  // Create ExecutionController
  const executionController = new ExecutionController<StepTaskWithMessage<TFlow>>(
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
  return new Worker(batchProcessor, lifecycle, sql, createLogger('Worker'));
}