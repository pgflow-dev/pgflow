import { Json } from './types.ts';
import { type MessageRecord } from './types.ts';
import { Queue } from './Queue.ts';
import { BatchArchiver } from './BatchArchiver.ts';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

/**
 * A class that executes a message handler.
 *
 * It handles the execution of the message handler and retries or archives the message
 * based on the retry limit and delay.
 *
 * It also handles the abort signal and logs the error.
 */
export class MessageExecutor<MessagePayload extends Json> {
  constructor(
    private readonly queue: Queue<MessagePayload>,
    private readonly record: MessageRecord<MessagePayload>,
    private readonly messageHandler: (message: MessagePayload) => Promise<void>,
    private readonly signal: AbortSignal,
    private readonly batchArchiver: BatchArchiver<MessagePayload>,
    private readonly retryLimit: number,
    private readonly retryDelay: number
  ) {}

  get msgId() {
    return this.record.msg_id;
  }

  async execute(): Promise<void> {
    try {
      if (this.signal.aborted) {
        throw new AbortError();
      }

      await Promise.race([
        this.messageHandler(this.record.message!),
        new Promise((_, reject) => {
          this.signal.addEventListener(
            'abort',
            () => {
              reject(new AbortError());
            },
            { once: true }
          );
        }),
      ]);

      console.log(
        `[MessageExecutor] Task ${this.msgId} completed successfully, archiving...`
      );
      await this.batchArchiver.add(this.msgId);
    } catch (error) {
      await this.handleExecutionError(error);
    }
  }

  /**
   * Handles the error that occurred during execution.
   *
   * If the error is an AbortError, it means that the worker was aborted and stopping,
   * the message will reappear after the visibility timeout and be picked up by another worker.
   *
   * Otherwise, it proceeds with retry or archiving forever.
   */
  private async handleExecutionError(error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[MessageExecutor] Aborted execution for ${this.msgId}`);
      // Do not throw - the worker was aborted and stopping,
      // the message will reappear after the visibility timeout
      // and be picked up by another worker
    } else {
      console.log(
        `[MessageExecutor] Task ${this.msgId} failed with error: ${error}`
      );
      await this.retryOrArchive();
    }
  }

  /**
   * Retries the message if it is available.
   * Otherwise, archives the message forever and stops processing it.
   */
  private async retryOrArchive() {
    if (this.retryAvailable) {
      // adjust visibility timeout for message to appear after retryDelay
      await this.queue.setVt(this.msgId, this.retryDelay);
    } else {
      // archive message forever and stop processing it
      // TODO: set 'permanently_failed' in headers when pgmq 1.5.0 is released
      await this.batchArchiver.add(this.msgId);
    }
  }

  /**
   * Returns true if the message can be retried.
   */
  private get retryAvailable() {
    const readCountLimit = this.retryLimit + 1; // initial read also counts

    return this.record.read_ct < readCountLimit;
  }
}
