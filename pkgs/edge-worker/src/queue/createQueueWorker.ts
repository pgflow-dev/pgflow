import { ExecutionController } from '../core/ExecutionController.ts';
import { MessageExecutor } from './MessageExecutor.ts';
import { Queries } from '../core/Queries.ts';
import { Queue } from './Queue.ts';
import { ReadWithPollPoller } from './ReadWithPollPoller.ts';
import type { Json } from '../core/types.ts';
import type { PgmqMessageRecord } from './types.ts';
import { Worker } from '../core/Worker.ts';
import postgres from 'postgres';
import { WorkerLifecycle } from '../core/WorkerLifecycle.ts';
import { BatchProcessor } from '../core/BatchProcessor.ts';

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
   * @default 3
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
 * @returns A configured Worker instance ready to be started
 */
export function createQueueWorker<TPayload extends Json>(
  handler: (message: TPayload) => Promise<void> | void,
  config: QueueWorkerConfig
): Worker {
  type QueueMessage = PgmqMessageRecord<TPayload>;

  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  // Use provided SQL connection if available, otherwise create one from connection string
  const sql =
    config.sql ||
    postgres(config.connectionString!, {
      max: config.maxPgConnections,
      prepare: false,
    });

  const queue = new Queue<TPayload>(sql, config.queueName || 'tasks');
  const queries = new Queries(sql);

  const lifecycle = new WorkerLifecycle<TPayload>(queries, queue);

  const executorFactory = (record: QueueMessage, signal: AbortSignal) => {
    return new MessageExecutor(
      queue,
      record,
      handler,
      signal,
      config.retryLimit || 5,
      config.retryDelay || 3
    );
  };

  const poller = new ReadWithPollPoller(queue, abortSignal, {
    batchSize: config.batchSize || config.maxConcurrent || 10,
    maxPollSeconds: config.maxPollSeconds || 5,
    pollIntervalMs: config.pollIntervalMs || 200,
    visibilityTimeout: config.visibilityTimeout || 3,
  });

  const executionController = new ExecutionController<QueueMessage>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: config.maxConcurrent || 10,
    }
  );
  const batchProcessor = new BatchProcessor<QueueMessage>(
    executionController,
    poller,
    abortSignal
  );

  return new Worker(batchProcessor, lifecycle, sql);
}
