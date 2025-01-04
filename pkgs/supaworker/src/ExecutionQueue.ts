import { MessageExecutor } from "./MessageExecutor.ts";
import { Queue } from "./Queue.ts";
import { Json } from "./types.ts";
import { MessageRecord } from "./Worker.ts";

export class ExecutionQueue<T extends Json> {
  private items = new Map<number, MessageExecutor<T>>();

  constructor(private queue: Queue<T>) {}

  async execute(
    record: MessageRecord<T>,
    handler: (message: T) => Promise<void>,
  ) {
    const executor = new MessageExecutor(this.queue, record, handler);
    this.items.set(executor.msgId, executor);

    try {
      await executor.execute();
    } finally {
      this.items.delete(executor.msgId);
    }
  }

  get size() {
    return this.items.size;
  }

  abort() {
    for (const executor of this.items.values()) {
      executor.abort();
    }
  }

  async waitForAll() {
    if (this.size > 0) {
      await Promise.all(
        Array.from(this.items.values()).map((e) => e.execute()),
      );
    }
    this.items.clear();
  }
}
