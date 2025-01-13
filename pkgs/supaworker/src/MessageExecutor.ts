import { Json } from './types.ts';
import { type MessageRecord } from './Worker.ts';
import { Queue } from './Queue.ts';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

export class MessageExecutor<MessagePayload extends Json> {
  executionPromise?: Promise<void>;

  constructor(
    private readonly queue: Queue<MessagePayload>,
    private readonly record: MessageRecord<MessagePayload>,
    private readonly messageHandler: (message: MessagePayload) => Promise<void>,
    private readonly signal: AbortSignal
  ) {}

  get msgId() {
    return this.record.msg_id;
  }

  execute(): this {
    if (!this.executionPromise) {
      this.executionPromise = this._execute();
    }
    return this;
  }

  private async _execute(): Promise<void> {
    try {
      // Check if already aborted
      if (this.signal.aborted) {
        throw new AbortError();
      }

      // Create a promise that rejects when abort signal is triggered
      const abortPromise = new Promise<void>((_, reject) => {
        this.signal.addEventListener(
          'abort',
          () => {
            reject(new AbortError());
          },
          { once: true }
        );
      });

      // Race between handler and abort signal
      await Promise.race([
        this.messageHandler(this.record.message!),
        abortPromise,
      ]);

      await this.queue.archive(this.record.msg_id);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Message processing cancelled:', this.record.msg_id);
      } else {
        console.error('Error processing message:', error);
        // Re-queue the message on non-abort errors
        await this.queue.setVt(this.msgId, 2);
      }
    }
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    if (!this.executionPromise) {
      throw new Error('Executor not started');
    }
    return this.executionPromise.finally(onfinally);
  }
}
