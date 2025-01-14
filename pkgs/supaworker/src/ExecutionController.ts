import { MessageExecutor } from './MessageExecutor.ts';
import { Queue } from './Queue.ts';
import { Json } from './types.ts';
import { MessageRecord } from './Worker.ts';
import { Sema } from 'npm:async-sema@^3.1.1';
import { BatchArchiver } from './BatchArchiver.ts';

export class ExecutionController<MessagePayload extends Json> {
  private executors = new Map<number, MessageExecutor<MessagePayload>>();
  private semaphore: Sema;
  private archiver: BatchArchiver<MessagePayload>;

  constructor(
    private queue: Queue<MessagePayload>,
    private signal: AbortSignal,
    maxConcurrent: number = 10
  ) {
    this.semaphore = new Sema(maxConcurrent);
    this.archiver = new BatchArchiver(queue);
  }

  async start(
    record: MessageRecord<MessagePayload>,
    handler: (message: MessagePayload) => Promise<void>
  ) {
    await this.semaphore.acquire();

    let executor: MessageExecutor<MessagePayload>;
    try {
      executor = new MessageExecutor(
        this.queue,
        record,
        handler,
        this.signal,
        this.archiver
      );

      // Add to tracking map (could throw)
      this.executors.set(executor.msgId, executor);

      try {
        console.log(
          `[ExecutionController] Starting execution for ${executor.msgId}`
        );
        executor.execute();
      } catch (error) {
        console.log(
          `[ExecutionController] Execution failed synchronously for ${executor.msgId}, cleaning up`
        );
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
    // await this.archiver.flush();
  }
}
