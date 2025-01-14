import { Json } from './types.ts';
import { type MessageRecord } from './Worker.ts';
import { Queue } from './Queue.ts';
import { BatchArchiver } from './BatchArchiver.ts';

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
    private readonly signal: AbortSignal,
    private readonly batchArchiver: BatchArchiver<MessagePayload>
  ) {}

  get msgId() {
    return this.record.msg_id;
  }

  execute(): Promise<void> {
    if (!this.executionPromise) {
      this.executionPromise = this._execute();
    } else {
      console.log('[MessageExecutor] Execution already started');
    }
    return this.executionPromise;
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

      this.batchArchiver.add(this.msgId);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[MessageExecutor] Aborted execution for ${this.msgId}`);
      } else {
        // Re-queue the message on non-abort errors
        await this.queue.setVt(this.msgId, 2);
      }
    }
  }

  finally(onfinally?: (() => void) | null): this {
    if (!this.executionPromise) {
      throw new Error('Executor not started');
    }

    this.executionPromise = this.executionPromise.finally(() => {
      if (onfinally) onfinally();
    });

    return this;
  }
}
