import PQueue from 'npm:p-queue';
import { MessageExecutor } from './MessageExecutor.ts';
import { Queue } from './Queue.ts';
import { Json } from './types.ts';
import { MessageRecord } from './types.ts';
import { BatchArchiver } from './BatchArchiver.ts';
import { getLogger } from './Logger.ts';

export interface ExecutionConfig {
  maxConcurrent: number;
  retryLimit: number;
  retryDelay: number;
}

export class ExecutionController<MessagePayload extends Json> {
  private logger = getLogger('ExecutionController');
  private queue: Queue<MessagePayload>;
  private pqueue: PQueue;
  private archiver: BatchArchiver<MessagePayload>;
  private signal: AbortSignal;
  private retryLimit: number;
  private retryDelay: number;

  constructor(
    queue: Queue<MessagePayload>,
    abortSignal: AbortSignal,
    config: ExecutionConfig
  ) {
    this.queue = queue;
    this.signal = abortSignal;
    this.retryLimit = config.retryLimit;
    this.retryDelay = config.retryDelay;
    this.pqueue = new PQueue({ concurrency: config.maxConcurrent });
    this.archiver = new BatchArchiver(queue);
  }

  async start(
    record: MessageRecord<MessagePayload>,
    handler: (message: MessagePayload) => Promise<void>
  ) {
    const executor = new MessageExecutor(
      this.queue,
      record,
      handler,
      this.signal,
      this.archiver,
      this.retryLimit,
      this.retryDelay
    );

    this.logger.info(`Starting execution for ${executor.msgId}`);

    return await this.pqueue.add(async () => {
      try {
        await executor.execute();
      } catch (error) {
        this.logger.error(`Execution failed for ${executor.msgId}:`, error);
        throw error;
      }
    });
  }

  async awaitCompletion() {
    await this.pqueue.onIdle();
    await this.archiver.flush();
  }
}
