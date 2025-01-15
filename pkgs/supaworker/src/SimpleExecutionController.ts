import { Json } from './types.ts';
import { MessageRecord } from './types.ts';

export class SimpleExecutionController<T extends Json> {
  private running = new Set<Promise<void>>();

  constructor(private maxConcurrent: number = 10) {}

  async start(
    record: MessageRecord<T>,
    handler: (message: T) => Promise<void>
  ) {
    while (this.running.size >= this.maxConcurrent) {
      await Promise.race([...this.running]);
    }

    const execution = this.execute(record, handler);
    this.running.add(execution);

    execution.finally(() => {
      this.running.delete(execution);
    });

    return execution;
  }

  private async execute(
    record: MessageRecord<T>,
    handler: (message: T) => Promise<void>
  ) {
    try {
      await handler(record.message!);
    } catch (error) {
      console.error('Error executing message:', error);
    }
  }

  async awaitCompletion() {
    if (this.running.size > 0) {
      await Promise.all(this.running);
    }
  }
}
