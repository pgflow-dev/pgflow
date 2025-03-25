import type { EdgeWorkerConfig } from "./EdgeWorker.ts";
import { ExecutionController } from "./ExecutionController.ts";
import { MessageExecutor } from "./MessageExecutor.ts";
// import { Queries } from "./Queries.ts";
import { Queue } from "./Queue.ts";
import type { Json, MessageRecord } from './types.ts';
import { Worker, type WorkerConfig } from './Worker.ts';
import postgres from 'postgres';

/**
 * Configuration for the queue worker
 */
export type QueueWorkerConfig = EdgeWorkerConfig & {
  retryLimit?: number;
  retryDelay?: number;
  connectionString?: string;
  sql?: postgres.Sql;
};

/**
 * Creates a new Worker instance for processing queue messages.
 *
 * @param handler - The message handler function that processes each message from the queue
 * @param config - Configuration options for the worker
 * @returns A configured Worker instance ready to be started
 */
export function createQueueWorker<MessagePayload extends Json>(
  handler: (message: MessagePayload) => Promise<void> | void,
  config: QueueWorkerConfig
): Worker<MessagePayload> {
  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  // Use provided SQL connection if available, otherwise create one from connection string
  const sql = config.sql || postgres(config.connectionString!, {
    max: config.maxPgConnections,
    prepare: false,
  });

  const queue = new Queue<MessagePayload>(sql, config.queueName || 'tasks');
  // const queries = new Queries(sql);

  const executorFactory = (record: MessageRecord<MessagePayload>, signal: AbortSignal) => {
    return new MessageExecutor(
      queue,
      record,
      handler,
      signal,
      config.retryLimit || 5,
      config.retryDelay || 3
    );
  }

  const executionController = new ExecutionController<MessagePayload>(
    executorFactory,
    abortSignal,
    {
      maxConcurrent: config.maxConcurrent || 10,
      // retryLimit: config.retryLimit,
      // retryDelay: config.retryDelay,
    }
  );

  const workerConfig: WorkerConfig = {
    queueName: config.queueName || 'tasks',
    sql,
    ...config,
  }

  return new Worker<MessagePayload>(executionController, workerConfig);
}
