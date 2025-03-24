import type { Json, MessageRecord } from '../types.ts';
import { Worker } from '../Worker.ts';
import { Queue } from '../Queue.ts';
import { Queries } from '../Queries.ts';
import { PgmqAdapter } from '../pgmq/PgmqAdapter.ts';
import { Lifecycle } from '../Lifecycle2.ts';
import { PgmqPoller } from '../pgmq/PgmqPoller.ts';
import { PgmqExecutor } from '../pgmq/PgmqExecutor.ts';
import postgres from 'postgres';

/**
 * Configuration options for PGMQ Worker
 */
export type PgmqWorkerConfig = {
  /**
   * Database connection string
   */
  connectionString?: string;

  /**
   * SQL client instance (if provided, connectionString is ignored)
   */
  sql?: postgres.Sql;

  /**
   * Queue name to process messages from
   * @default 'tasks'
   */
  queueName?: string;

  /**
   * Maximum number of PostgreSQL connections
   * @default 10
   */
  maxPgConnections?: number;

  /**
   * Maximum number of concurrent tasks
   * @default 10
   */
  maxConcurrent?: number;

  /**
   * Maximum time in seconds to wait for new messages
   * @default 5
   */
  maxPollSeconds?: number;

  /**
   * Interval in milliseconds between polling attempts
   * @default 200
   */
  pollIntervalMs?: number;

  /**
   * Delay in seconds before retrying a failed message
   * @default 5
   */
  retryDelay?: number;

  /**
   * Maximum number of retries for a failed message
   * @default 5
   */
  retryLimit?: number;

  /**
   * Time in seconds that a message is hidden from other consumers
   * @default 3
   */
  visibilityTimeout?: number;
};

/**
 * Creates a Worker instance configured for PGMQ
 *
 * This factory function creates all the necessary dependencies and injects them into the Worker.
 * It maintains backward compatibility with the existing Worker API.
 */
export function createPgmqWorker<MessagePayload extends Json>(
  messageHandler: (message: MessagePayload) => Promise<void> | void,
  config: PgmqWorkerConfig
): Worker<MessageRecord<MessagePayload>> {
  const abortController = new AbortController();

  // Default configuration values
  const queueName = config.queueName || 'tasks';
  const maxConcurrent = config.maxConcurrent || 10;
  const maxPollSeconds = config.maxPollSeconds || 5;
  const pollIntervalMs = config.pollIntervalMs || 200;
  const visibilityTimeout = config.visibilityTimeout || 3;
  const retryLimit = config.retryLimit || 5;
  const retryDelay = config.retryDelay || 5;

  // Create SQL client if not provided
  const sql = config.sql || postgres(config.connectionString!, {
    max: config.maxPgConnections || 10,
    prepare: false,
  });

  // Create dependencies
  const queue = new Queue<MessagePayload>(sql, queueName);
  const queries = new Queries(sql);
  
  // Create adapter and lifecycle
  const adapter = new PgmqAdapter<MessagePayload>(queries, queue);
  const lifecycle = new Lifecycle(adapter, queueName);

  // Create poller
  const poller = new PgmqPoller<MessagePayload>(
    queue,
    abortController.signal,
    {
      batchSize: maxConcurrent,
      maxPollSeconds,
      pollIntervalMs,
      visibilityTimeout,
    }
  );

  // Create executor
  const executor = new PgmqExecutor<MessagePayload>(
    queue,
    messageHandler,
    abortController.signal,
    retryLimit,
    retryDelay
  );

  // Create and return worker
  return new Worker<MessageRecord<MessagePayload>>({
    poller,
    executor,
    lifecycle,
    abortController
  });
}