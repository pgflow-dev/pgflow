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
   * How long to wait before retrying a failed job in seconds
   * @default 5
   */
  retryDelay?: number;

  /**
   * How many times to retry a failed job
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
      config.retryLimit || 5,
      config.retryDelay || 3,
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
