import type { Json } from './types.ts';
import { Worker, type WorkerConfig } from './Worker.ts';

/**
 * Creates a new Worker instance for processing queue messages.
 *
 * @param handler - The message handler function that processes each message from the queue
 * @param config - Configuration options for the worker
 * @returns A configured Worker instance ready to be started
 */
export function createQueueWorker<MessagePayload extends Json>(
  handler: (message: MessagePayload) => Promise<void> | void,
  config: WorkerConfig
): Worker<MessagePayload> {
  return new Worker<MessagePayload>(handler, {
    queueName: config.queueName || 'tasks',
    ...config,
  });
}
