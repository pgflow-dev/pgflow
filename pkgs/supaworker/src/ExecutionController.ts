import { MessageExecutor } from './MessageExecutor.ts';
import { Queue } from './Queue.ts';
import { Json } from './types.ts';
import { MessageRecord } from './Worker.ts';

export class ExecutionController<T extends Json> {
  private executors = new Map<number, MessageExecutor<T>>();
  constructor(
    private queue: Queue<T>,
    private signal: AbortSignal,
    private maxConcurrent: number = 10
  ) {
    signal.addEventListener('abort', () => this.abortAll());
  }

  async start(
    record: MessageRecord<T>,
    handler: (message: T) => Promise<void>
  ) {
    // Wait if at capacity
    while (this.activeCount >= this.maxConcurrent) {
      await Promise.race([
        ...Array.from(this.executors.values()).map((e) => e.execute()),
        new Promise((_, reject) => {
          this.signal?.addEventListener(
            'abort',
            () => reject(new Error('Aborted while waiting for execution slot')),
            { once: true }
          );
        }),
      ]).catch(() => {});
    }

    const executor = new MessageExecutor(this.queue, record, handler);
    this.executors.set(executor.msgId, executor);

    try {
      await executor.execute();
    } finally {
      this.executors.delete(executor.msgId);
    }
  }

  get activeCount() {
    return this.executors.size;
  }

  abortAll() {
    for (const executor of this.executors.values()) {
      executor.abort();
    }
  }

  async awaitCompletion() {
    if (this.activeCount > 0) {
      await Promise.all(
        Array.from(this.executors.values()).map((e) => e.execute())
      );
    }
    this.executors.clear();
  }
}
