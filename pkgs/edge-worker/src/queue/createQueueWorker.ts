import { ExecutionController } from '../core/ExecutionController.js';
import { MessageExecutor } from './MessageExecutor.js';
import { Queries } from '../core/Queries.js';
import { Queue } from './Queue.js';
import { ReadWithPollPoller } from './ReadWithPollPoller.js';
import type { Json } from '../core/types.js';
import type { PgmqMessageRecord, MessageHandlerFn } from './types.js';
import { Worker } from '../core/Worker.js';
import postgres from 'postgres';
import { WorkerLifecycle } from '../core/WorkerLifecycle.js';
import { BatchProcessor } from '../core/BatchProcessor.js';
import type { Logger } from '../platform/types.js';

/**
 * Fixed retry strategy configuration
 */
export interface FixedRetryConfig {
  /**
   * Use fixed delay between retries
   */
  strategy: 'fixed';

  /**
   * Maximum number of retry attempts
   */
  limit: number;

  /**
   * Fixed delay in seconds between retries
   */
  baseDelay: number;
}

/**
 * Exponential backoff retry strategy configuration
 */
export interface ExponentialRetryConfig {
  /**
   * Use exponential backoff between retries
   */
  strategy: 'exponential';

  /**
   * Maximum number of retry attempts
   */
  limit: number;

  /**
   * Base delay in seconds (initial delay for exponential backoff)
   */
  baseDelay: number;

  /**
   * Maximum delay in seconds for exponential backoff
   * @default 300
   */
  maxDelay?: number;
}

/**
 * Retry configuration for message processing
 */
export type RetryConfig = FixedRetryConfig | ExponentialRetryConfig;

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
 * Configuration for the queue worker
 */
export type QueueWorkerConfig = {
  /**
   * PostgreSQL connection string.
   * If not provided, it will be read from the EDGE_WORKER_DB_URL environment variable.
   */
  connectionString?: string;

  /**
   * Name of the queue to poll for messages
   * @default 'tasks'
   */
  queueName?: string;

  /**
   * How many tasks are processed at the same time
   * @default 10
   */
  maxConcurrent?: number;

  /**
   * How many connections to the database are opened
   * @default 4
   */
  maxPgConnections?: number;

  /**
   * In-worker polling interval in seconds
   * @default 5
   */
  maxPollSeconds?: number;

  /**
   * In-database polling interval in milliseconds
   * @default 200
   */
  pollIntervalMs?: number;

  /**
   * Retry configuration for failed messages
   */
  retry?: RetryConfig;

  /**
   * How long to wait before retrying a failed job in seconds
   * @deprecated Use retry.baseDelay with retry.strategy = 'fixed' instead
   * @default 5
   */
  retryDelay?: number;

  /**
   * How many times to retry a failed job
   * @deprecated Use retry.limit instead
   * @default 5
   */
  retryLimit?: number;

  /**
   * How long a job is invisible after reading in seconds.
   * If not successful, will reappear after this time.
   * @default 10
   */
  visibilityTimeout?: number;

  /**
   * Batch size for polling messages
   * @default 10
   */
  batchSize?: number;

  /**
   * Optional SQL client instance
   */
  sql?: postgres.Sql;
};

/**
 * Creates a new Worker instance for processing queue messages.
 *
 * @param handler - The message handler function that processes each message from the queue
 * @param config - Configuration options for the worker
 * @param createLogger - Function to create loggers for different components
 * @returns A configured Worker instance ready to be started
 */
export function createQueueWorker<TPayload extends Json>(
  handler: MessageHandlerFn<TPayload>,
  config: QueueWorkerConfig,
  createLogger: (module: string) => Logger
): Worker {
  type QueueMessage = PgmqMessageRecord<TPayload>;

  // Create component-specific loggers
  const logger = createLogger('QueueWorker');
  logger.info(`Creating queue worker for ${config.queueName || 'tasks'}`);

  // Handle legacy retry configuration
  let retryConfig = config.retry;
  if (!retryConfig && (config.retryDelay !== undefined || config.retryLimit !== undefined)) {
    console.warn('retryLimit and retryDelay are deprecated. Use retry config instead.');
    retryConfig = {
      strategy: 'fixed' as const,
      limit: config.retryLimit ?? 5,
      baseDelay: config.retryDelay ?? 3,
    };
  }
  
  // Default retry config if none provided
  if (!retryConfig) {
    retryConfig = {
      strategy: 'exponential' as const,
      limit: 5,
      baseDelay: 3,
      maxDelay: 300,
    };
  }

  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  // Use provided SQL connection if available, otherwise create one from connection string
  const sql =
    config.sql ||
    postgres(config.connectionString || '', {
      max: config.maxPgConnections,
      prepare: false,
    });

  const queue = new Queue<TPayload>(
    sql,
    config.queueName || 'tasks',
    createLogger('Queue')
  );

  const queries = new Queries(sql);

  const lifecycle = new WorkerLifecycle<TPayload>(
    queries,
    queue,
    createLogger('WorkerLifecycle')
  );

  const executorFactory = (record: QueueMessage, signal: AbortSignal) => {
    return new MessageExecutor(
      queue,
      record,
      handler,
      signal,
      retryConfig,
      calculateRetryDelay,
      createLogger('MessageExecutor')
    );
  };

  const poller = new ReadWithPollPoller(
    queue,
    abortSignal,
    {
      batchSize: config.batchSize || config.maxConcurrent || 10,
      maxPollSeconds: config.maxPollSeconds || 5,
      pollIntervalMs: config.pollIntervalMs || 200,
      visibilityTimeout: config.visibilityTimeout || 10,
    },
    createLogger('ReadWithPollPoller')
  );

  const executionController = new ExecutionController<QueueMessage>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: config.maxConcurrent || 10,
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
