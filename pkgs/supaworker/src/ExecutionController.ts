import { MessageExecutor } from './MessageExecutor.ts';
import { Queue } from './Queue.ts';
import { Json } from './types.ts';
import { MessageRecord } from './Worker.ts';
import { Sema } from 'npm:async-sema@^3.1.1';

export class ExecutionController<T extends Json> {
  private executors = new Map<number, MessageExecutor<T>>();
  private semaphore: Sema;

  constructor(
    private queue: Queue<T>,
    private signal: AbortSignal,
    maxConcurrent: number = 10
  ) {
    signal.addEventListener('abort', () => this.abortAll());
    this.semaphore = new Sema(maxConcurrent);
  }

  async start(
    record: MessageRecord<T>,
    handler: (message: T) => Promise<void>
  ) {
    const executor = await this.waitForAvailableExecutor(record, handler);

    this.executors.set(executor.msgId, executor);

    const execution = executor.execute().finally(() => {
      this.executors.delete(executor.msgId);
      this.semaphore.release();
    });

    return execution;
  }

  async abortAll() {
    await Promise.all(
      Array.from(this.executors.values()).map((e) => e.abort())
    );
  }

  async awaitCompletion() {
    if (this.executors.size > 0) {
      await Promise.all(
        Array.from(this.executors.values()).map((e) => e.executionPromise)
      );
    }
  }

  private async waitForAvailableExecutor(
    record: MessageRecord<T>,
    handler: (message: T) => Promise<void>
  ) {
    try {
      await this.semaphore.acquire();

      return new MessageExecutor(this.queue, record, handler);
    } catch (e) {
      this.semaphore.release();

      throw e;
    }
  }
}
