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
    this.semaphore = new Sema(maxConcurrent);
  }

  async start(
    record: MessageRecord<T>,
    handler: (message: T) => Promise<void>
  ) {
    await this.semaphore.acquire();

    let executor: MessageExecutor<T>;
    try {
      // Create executor (could throw)
      executor = new MessageExecutor(this.queue, record, handler, this.signal);

      // Add to tracking map (could throw)
      this.executors.set(executor.msgId, executor);

      try {
        // Start execution (could throw synchronously)
        executor.execute();
      } catch (error) {
        // Clean up if execute() throws synchronously
        this.executors.delete(executor.msgId);
        throw error;
      }

      // Only attach finally() after successful execute()
      executor.finally(() => {
        this.executors.delete(executor.msgId);
        this.semaphore.release();
      });

      return executor;
    } catch (error) {
      // Release semaphore if anything fails during setup
      this.semaphore.release();
      throw error;
    }
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

      return new MessageExecutor(this.queue, record, handler, this.signal);
    } catch (e) {
      this.semaphore.release();

      throw e;
    }
  }
}
