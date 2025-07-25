import type { AnyFlow } from '@pgflow/dsl';
import { ExecutionController } from '../core/ExecutionController.js';
import { StepTaskPoller, type StepTaskPollerConfig } from './StepTaskPoller.js';
import { StepTaskExecutor } from './StepTaskExecutor.js';
import { PgflowSqlClient } from '@pgflow/core';
import { Queries } from '../core/Queries.js';
import type { IExecutor } from '../core/types.js';
import type { Logger, PlatformAdapter } from '../platform/types.js';
import type { StepTaskWithMessage } from '../core/context.js';
import { Worker } from '../core/Worker.js';
import postgres from 'postgres';
import { FlowWorkerLifecycle } from './FlowWorkerLifecycle.js';
import { BatchProcessor } from '../core/BatchProcessor.js';

/**
 * Configuration for the flow worker with two-phase polling
 */
export type FlowWorkerConfig = {
  /**
   * How many tasks are processed at the same time
   * @default 10
   */
  maxConcurrent?: number;

  /**
   * PostgreSQL connection string.
   * If not provided, it will be read from the EDGE_WORKER_DB_URL environment variable.
   */
  connectionString?: string;

  /**
   * Optional SQL client instance
   */
  sql?: postgres.Sql;

  /**
   * How many connections to the database are opened
   * @default 4
   */
  maxPgConnections?: number;

  /**
   * Batch size for polling messages
   * @default 10
   */
  batchSize?: number;

  /**
   * Visibility timeout for messages in seconds
   * @default 2
   */
  visibilityTimeout?: number;

  /**
   * In-worker polling interval in seconds
   * @default 2
   */
  maxPollSeconds?: number;

  /**
   * In-database polling interval in milliseconds
   * @default 100
   */
  pollIntervalMs?: number;

  /**
   * Environment variables for context
   * @internal
   */
  env?: Record<string, string | undefined>;
};

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
    postgres(config.connectionString!, {
      max: config.maxPgConnections,
      prepare: false,
    });

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
    createLogger('FlowWorkerLifecycle')
  );

  // Create StepTaskPoller with two-phase approach
  const pollerConfig: StepTaskPollerConfig = {
    batchSize: config.batchSize || 10,
    queueName: flow.slug,
    visibilityTimeout: config.visibilityTimeout || 2,
    maxPollSeconds: config.maxPollSeconds || 2,
    pollIntervalMs: config.pollIntervalMs || 100,
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
    const context = {
      // Core platform resources
      env: platformAdapter.env,
      shutdownSignal: platformAdapter.shutdownSignal,
      
      // Step task execution context
      rawMessage: taskWithMessage.message,
      stepTask: taskWithMessage.task,
      
      // Platform-specific resources (generic)
      ...platformAdapter.platformResources
    };
    
    return new StepTaskExecutor<TFlow>(
      flow,
      pgflowAdapter,
      signal,
      createLogger('StepTaskExecutor'),
      context
    );
  };

  // Create ExecutionController
  const executionController = new ExecutionController<StepTaskWithMessage<TFlow>>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: config.maxConcurrent || 10,
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