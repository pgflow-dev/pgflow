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
  private readonly maxConcurrent: number;
  private slotWaiters = new Set<() => void>();

  constructor(
    executorFactory: (record: TMessage, signal: AbortSignal) => IExecutor,
    abortSignal: AbortSignal,
    config: ExecutionConfig,
    logger: Logger
  ) {
    this.signal = abortSignal;
    this.createExecutor = executorFactory;
    this.maxConcurrent = config.maxConcurrent;
    this.promiseQueue = newQueue(config.maxConcurrent);
    this.logger = logger;
  }

  get availableSlots(): number {
    return Math.max(0, this.maxConcurrent - this.promiseQueue.size());
  }

  start(record: TMessage) {
    const executor = this.createExecutor(record, this.signal);

    this.logger.debug(`Scheduling execution of task ${executor.msgId}`);

    return this.promiseQueue.add(async () => {
      try {
        this.logger.debug(`Executing task ${executor.msgId}...`);
        await executor.execute();
        this.logger.debug(`Execution successful for ${executor.msgId}`);
      } catch (error) {
        this.logger.error(`Execution failed for ${executor.msgId}`, error);
        throw error;
      } finally {
        this.notifySlotWaiters();
      }
    });
  }

  async waitForSlot(): Promise<void> {
    if (this.signal.aborted || this.availableSlots > 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      const onAbort = () => {
        cleanup();
        resolve();
      };
      const onSlotFreed = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.slotWaiters.delete(onSlotFreed);
        this.signal.removeEventListener('abort', onAbort);
      };

      this.slotWaiters.add(onSlotFreed);
      this.signal.addEventListener('abort', onAbort, { once: true });

      if (this.signal.aborted || this.availableSlots > 0) {
        cleanup();
        resolve();
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

  private notifySlotWaiters() {
    const waiters = [...this.slotWaiters];
    this.slotWaiters.clear();
    for (const waiter of waiters) {
      waiter();
    }
  }
}
