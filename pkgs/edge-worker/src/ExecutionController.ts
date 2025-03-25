import { newQueue, type Queue as PromiseQueue } from '@henrygd/queue';
import type { MessageExecutor } from './MessageExecutor.ts';
import type { Json } from './types.ts';
import type { MessageRecord } from './types.ts';
import { getLogger } from './Logger.ts';

export interface ExecutionConfig {
  maxConcurrent: number;
}

export class ExecutionController<MessagePayload extends Json> {
  private logger = getLogger('ExecutionController');
  private promiseQueue: PromiseQueue;
  private signal: AbortSignal;
  private createExecutor: (record: MessageRecord<MessagePayload>, signal: AbortSignal) => MessageExecutor<MessagePayload>;

  constructor(
    executorFactory: (record: MessageRecord<MessagePayload>, signal: AbortSignal) => MessageExecutor<MessagePayload>,
    abortSignal: AbortSignal,
    config: ExecutionConfig
  ) {
    this.signal = abortSignal;
    this.createExecutor = executorFactory;
    this.promiseQueue = newQueue(config.maxConcurrent);
  }

  async start(
    record: MessageRecord<MessagePayload>,
  ) {
    const executor = this.createExecutor(record, this.signal);

    this.logger.info(`Scheduling execution of task ${executor.msgId}`);

    return await this.promiseQueue.add(async () => {
      try {
        this.logger.debug(`Executing task ${executor.msgId}...`);
        await executor.execute();
        this.logger.debug(`Execution successful for ${executor.msgId}`);
      } catch (error) {
        this.logger.error(`Execution failed for ${executor.msgId}:`, error);
        throw error;
      }
    });
  }

  async awaitCompletion() {
    const active = this.promiseQueue.active();
    const all = this.promiseQueue.size();

    this.logger.debug(
      `Awaiting completion of all tasks... (active/all: ${active}}/${all})`
    );
    await this.promiseQueue.done();
  }
}
