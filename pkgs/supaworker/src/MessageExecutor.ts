import { Json } from './types.ts';
import { type MessageRecord } from './Worker.ts';
import { Queue } from './Queue.ts';

export class MessageExecutor<MessagePayload extends Json> {
  private controller: AbortController;
  private executionPromise?: Promise<void>;

  constructor(
    private readonly queue: Queue<MessagePayload>,
    private readonly record: MessageRecord<MessagePayload>,
    private readonly messageHandler: (message: MessagePayload) => Promise<void>
  ) {
    this.controller = new AbortController();
  }

  get msgId() {
    return this.record.msg_id;
  }

  abort() {
    this.controller.abort();
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    if (!this.executionPromise) {
      throw new Error('Executor not started');
    }
    return this.executionPromise.finally(onfinally);
  }

  execute(): this {
    if (!this.executionPromise) {
      this.executionPromise = this._execute();
    }
    return this;
  }

  async _execute(): Promise<void> {
    try {
      await this.messageHandler(this.record.message!);
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
}
