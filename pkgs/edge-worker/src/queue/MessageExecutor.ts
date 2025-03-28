import type { Json } from '../core/types.ts';
import type { PgmqMessageRecord } from './types.ts';
import type { Queue } from './Queue.ts';
import { getLogger } from '../core/Logger.ts';

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
export class MessageExecutor<TPayload extends Json> {
  private logger = getLogger('MessageExecutor');

  constructor(
    private readonly queue: Queue<TPayload>,
    private readonly record: PgmqMessageRecord<TPayload>,
    private readonly messageHandler: (
      message: TPayload
    ) => Promise<void> | void,
    private readonly signal: AbortSignal,
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

      // Check if already aborted before starting
      this.signal.throwIfAborted();

      this.logger.debug(`Executing task ${this.msgId}...`);
      await this.messageHandler(this.record.message!);

      this.logger.debug(
        `Task ${this.msgId} completed successfully, archiving...`
      );
      await this.queue.archive(this.msgId);
      this.logger.debug(`Archived task ${this.msgId} successfully`);
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
      this.logger.debug(`Aborted execution for ${this.msgId}`);
      // Do not throw - the worker was aborted and stopping,
      // the message will reappear after the visibility timeout
      // and be picked up by another worker
    } else {
      this.logger.debug(`Task ${this.msgId} failed with error: ${error}`);
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
      this.logger.debug(`Retrying ${this.msgId} in ${this.retryDelay} seconds`);
      await this.queue.setVt(this.msgId, this.retryDelay);
    } else {
      // archive message forever and stop processing it
      this.logger.debug(`Archiving ${this.msgId} forever`);
      await this.queue.archive(this.msgId);
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
