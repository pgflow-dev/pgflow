import type { Json, MessageRecord } from '../types.ts';
import { Worker } from '../Worker.ts';
import { Queue } from '../Queue.ts';
import { Queries } from '../Queries.ts';
import { PgmqLifecycle } from '../pgmq/PgmqLifecycle.ts';
import { PgmqPoller } from '../pgmq/PgmqPoller.ts';
import { PgmqExecutor } from '../pgmq/PgmqExecutor.ts';
import { BatchArchiver } from '../BatchArchiver.ts';
import type { WorkerConfig } from '../Worker.ts';

/**
 * Creates a Worker instance configured for PGMQ
 * 
 * This factory function creates all the necessary dependencies and injects them into the Worker.
 * It maintains backward compatibility with the existing Worker API.
 */
export function createPgmqWorker<MessagePayload extends Json>(
  messageHandler: (message: MessagePayload) => Promise<void> | void,
  config: WorkerConfig
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
  
  // Create dependencies
  const queue = new Queue<MessagePayload>(config.sql, queueName);
  const queries = new Queries(config.sql);
  const lifecycle = new PgmqLifecycle<MessagePayload>(queries, queue);
  const batchArchiver = new BatchArchiver<MessagePayload>(queue);
  
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
    batchArchiver,
    retryLimit,
    retryDelay
  );
  
  // Create and return worker
  return new Worker<MessageRecord<MessagePayload>>(
    poller,
    executor,
    lifecycle,
    abortController
  );
}