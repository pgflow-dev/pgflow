import { ExecutionController } from '../core/ExecutionController.js';
import { MessageExecutor } from './MessageExecutor.js';
import { Queries } from '../core/Queries.js';
import { Queue } from './Queue.js';
import { ReadWithPollPoller } from './ReadWithPollPoller.js';
import type { Json } from '../core/types.js';
import type { PgmqMessageRecord, MessageHandlerFn } from './types.js';
import type { MessageHandlerContext } from '../core/context.js';
import { createContextSafeConfig } from '../core/context.js';
import { Worker } from '../core/Worker.js';
import postgres from 'postgres';
import { WorkerLifecycle } from '../core/WorkerLifecycle.js';
import { BatchProcessor } from '../core/BatchProcessor.js';
import type { Logger, PlatformAdapter } from '../platform/types.js';
import { validateRetryConfig } from './validateRetryConfig.js';
import type { RetryConfig, QueueWorkerConfig, ResolvedQueueWorkerConfig, ExponentialRetryConfig } from '../core/workerConfigTypes.js';

// Re-export types from workerConfigTypes to maintain backward compatibility
export type {
  FixedRetryConfig,
  ExponentialRetryConfig,
  RetryConfig,
  QueueWorkerConfig
} from '../core/workerConfigTypes.js';

// Default configuration constants
const DEFAULT_QUEUE_CONFIG = {
  queueName: 'tasks',
  maxConcurrent: 10,
  maxPgConnections: 4,
  maxPollSeconds: 5,
  pollIntervalMs: 200,
  visibilityTimeout: 10,
  batchSize: 10,
} as const;

const DEFAULT_RETRY_CONFIG: ExponentialRetryConfig = {
  strategy: 'exponential',
  limit: 5,
  baseDelay: 3,
  maxDelay: 300,
};

/**
 * Normalizes queue worker configuration by applying all defaults and handling deprecated fields
 */
function normalizeQueueConfig(config: QueueWorkerConfig, sql: postgres.Sql): ResolvedQueueWorkerConfig {
  // Handle legacy retry configuration
  let retryConfig = config.retry;
  
  // Check if both new and legacy config are provided
  if (retryConfig && (config.retryDelay !== undefined || config.retryLimit !== undefined)) {
    // Warning already logged in the main function
  } else if (!retryConfig && (config.retryDelay !== undefined || config.retryLimit !== undefined)) {
    // Convert legacy to new format
    retryConfig = {
      strategy: 'fixed' as const,
      limit: config.retryLimit ?? 5,
      baseDelay: config.retryDelay ?? 3,
    };
  }
  
  // Default retry config if none provided
  if (!retryConfig) {
    retryConfig = DEFAULT_RETRY_CONFIG;
  }
  
  // Validate the final retry config
  validateRetryConfig(retryConfig);

  // Strip deprecated fields before merging
  const { retryDelay: _rd, retryLimit: _rl, ...rest } = config;
  return {
    connectionString: '',
    ...DEFAULT_QUEUE_CONFIG,
    ...rest,
    retry: retryConfig,
    sql,
    env: rest.env ?? {}
  };
}

/**
 * Calculates the delay before the next retry attempt based on the retry strategy
 * @param attempt - The current attempt number (1-based)
 * @param config - The retry configuration
 * @returns The delay in seconds before the next retry
 */
export function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  switch (config.strategy) {
    case 'fixed':
      return config.baseDelay;

    case 'exponential': {
      const delay = config.baseDelay * Math.pow(2, attempt - 1);
      return Math.min(delay, config.maxDelay ?? 300);
    }
  }
}


/**
 * Creates a new Worker instance for processing queue messages.
 *
 * @param handler - The message handler function that processes each message from the queue
 * @param config - Configuration options for the worker
 * @param createLogger - Function to create loggers for different components
 * @param platformAdapter - Platform adapter for creating contexts
 * @returns A configured Worker instance ready to be started
 */
export function createQueueWorker<TPayload extends Json, TResources extends Record<string, unknown>>(
  handler: MessageHandlerFn<TPayload, MessageHandlerContext<TPayload, TResources>>,
  config: QueueWorkerConfig,
  createLogger: (module: string) => Logger,
  platformAdapter: PlatformAdapter<TResources>
): Worker {
  type QueueMessage = PgmqMessageRecord<TPayload>;

  // Create component-specific loggers
  const logger = createLogger('QueueWorker');

  // Handle legacy retry configuration warnings
  if (config.retry && (config.retryDelay !== undefined || config.retryLimit !== undefined)) {
    logger.warn(
      'Both "retry" and legacy "retryDelay/retryLimit" were supplied - ignoring legacy values',
      { retry: config.retry, retryDelay: config.retryDelay, retryLimit: config.retryLimit }
    );
  } else if (!config.retry && (config.retryDelay !== undefined || config.retryLimit !== undefined)) {
    logger.warn('retryLimit and retryDelay are deprecated. Use retry config instead.');
  }

  // Use platform's shutdown signal
  const abortSignal = platformAdapter.shutdownSignal;

  // Use provided SQL connection if available, otherwise create one from connection string
  const sql =
    config.sql ||
    postgres(config.connectionString || '', {
      max: config.maxPgConnections ?? DEFAULT_QUEUE_CONFIG.maxPgConnections,
      prepare: false,
    });

  // Normalize config with all defaults applied ONCE
  const resolvedConfig = normalizeQueueConfig(config, sql);
  
  logger.info(`Creating queue worker for ${resolvedConfig.queueName}`);

  const queue = new Queue<TPayload>(
    sql,
    resolvedConfig.queueName,
    createLogger('Queue')
  );

  const queries = new Queries(sql);

  const lifecycle = new WorkerLifecycle<TPayload>(
    queries,
    queue,
    createLogger('WorkerLifecycle')
  );

  // Create frozen worker config ONCE for reuse across all message executions
  const frozenWorkerConfig = createContextSafeConfig(resolvedConfig);

  const executorFactory = (record: QueueMessage, signal: AbortSignal) => {
    // Build context directly using platform resources
    const context: MessageHandlerContext<TPayload, TResources> = {
      // Core platform resources
      env: platformAdapter.env,
      shutdownSignal: platformAdapter.shutdownSignal,
      
      // Message execution context
      rawMessage: record,
      workerConfig: frozenWorkerConfig, // Reuse cached frozen config
      
      // Platform-specific resources (generic)
      ...platformAdapter.platformResources
    };
    
    return new MessageExecutor<TPayload, MessageHandlerContext<TPayload, TResources>>(
      queue,
      handler,
      signal,
      resolvedConfig.retry,
      calculateRetryDelay,
      createLogger('MessageExecutor'),
      context
    );
  };

  const poller = new ReadWithPollPoller(
    queue,
    abortSignal,
    {
      batchSize: resolvedConfig.batchSize,
      maxPollSeconds: resolvedConfig.maxPollSeconds,
      pollIntervalMs: resolvedConfig.pollIntervalMs,
      visibilityTimeout: resolvedConfig.visibilityTimeout,
    },
    createLogger('ReadWithPollPoller')
  );

  const executionController = new ExecutionController<QueueMessage>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: resolvedConfig.maxConcurrent,
    },
    createLogger('ExecutionController')
  );

  const batchProcessor = new BatchProcessor<QueueMessage>(
    executionController,
    poller,
    abortSignal,
    createLogger('BatchProcessor')
  );

  return new Worker(batchProcessor, lifecycle, sql, createLogger('Worker'));
}
