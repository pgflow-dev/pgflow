import type { EdgeWorkerConfig } from "./EdgeWorker.ts";
import { ExecutionController } from "./ExecutionController.ts";
import { MessageExecutor } from "./MessageExecutor.ts";
import { Queries } from "./Queries.ts";
import { Queue } from "./Queue.ts";
import { ReadWithPollPoller } from './ReadWithPollPoller.ts';
import type { IExecutor, IPoller, Json, PgmqMessageRecord } from './types.ts';
import { Worker } from './Worker.ts';
import postgres from 'postgres';
import { WorkerLifecycle } from "./WorkerLifecycle.ts";
import { BatchProcessor } from "./BatchProcessor.ts";

/**
 * Configuration for the queue worker
 */
export type QueueWorkerConfig = EdgeWorkerConfig & {
  queueName?: string;
  maxConcurrent?: number;
  retryLimit?: number;
  retryDelay?: number;
  connectionString?: string;
  sql?: postgres.Sql;
  maxPgConnections?: number;
  batchSize?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
  visibilityTimeout?: number;
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
  const sql = config.sql || postgres(config.connectionString!, {
    max: config.maxPgConnections,
    prepare: false,
  });

  const queue = new Queue<TPayload>(sql, config.queueName || 'tasks');
  const queries = new Queries(sql);

  const lifecycle = new WorkerLifecycle<TPayload>(queries, queue);

  const executorFactory = (record: QueueMessage, signal: AbortSignal): IExecutor => {
    return new MessageExecutor(
      queue,
      record,
      handler,
      signal,
      config.retryLimit || 5,
      config.retryDelay || 3
    );
  }

  const poller: IPoller<QueueMessage> = new ReadWithPollPoller(queue, abortSignal, {
    batchSize: config.maxConcurrent || 10,
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
