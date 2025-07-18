import { newQueue, type Queue as PromiseQueue } from '@henrygd/queue';
import type { IExecutor, IMessage } from './types.js';
import type { Logger } from '../platform/types.js';

export interface ExecutionConfig {
  maxConcurrent: number;
}

export class ExecutionController<TMessage extends IMessage> {
  private logger: Logger;
  private promiseQueue: PromiseQueue;
  private signal: AbortSignal;
  private createExecutor: (record: TMessage, signal: AbortSignal) => IExecutor;

  constructor(
    executorFactory: (record: TMessage, signal: AbortSignal) => IExecutor,
    abortSignal: AbortSignal,
    config: ExecutionConfig,
    logger: Logger
  ) {
    this.signal = abortSignal;
    this.createExecutor = executorFactory;
    this.promiseQueue = newQueue(config.maxConcurrent);
    this.logger = logger;
  }

  async start(record: TMessage) {
    const executor = this.createExecutor(record, this.signal);

    this.logger.debug(`Scheduling execution of task ${executor.msgId}`);

    return await this.promiseQueue.add(async () => {
      try {
        this.logger.debug(`Executing task ${executor.msgId}...`);
        await executor.execute();
        this.logger.debug(`Execution successful for ${executor.msgId}`);
      } catch (error) {
        this.logger.error(`Execution failed for ${executor.msgId}`, error);
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
