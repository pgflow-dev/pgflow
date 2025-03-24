import type { Json, MessageRecord } from '../types.ts';
import type { Queue } from '../Queue.ts';
import { getLogger } from '../Logger.ts';
import type { Executor } from '../interfaces/Executor.ts';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

/**
 * Implementation of Executor for PGMQ
 */
export class PgmqExecutor<MessagePayload extends Json> implements Executor<MessageRecord<MessagePayload>> {
  private logger = getLogger('PgmqExecutor');
  private currentMsgId: number | null = null;

  constructor(
    private readonly queue: Queue<MessagePayload>,
    private readonly messageHandler: (
      message: MessagePayload
    ) => Promise<void> | void,
    private readonly signal: AbortSignal,
    private readonly retryLimit: number,
    private readonly retryDelay: number
  ) {}

  get msgId() {
    return this.currentMsgId ?? 'unknown';
  }

  async execute(record: MessageRecord<MessagePayload>): Promise<void> {
    this.currentMsgId = record.msg_id;

    try {
      if (this.signal.aborted) {
        throw new AbortError();
      }

      // Check if already aborted before starting
      this.signal.throwIfAborted();

      this.logger.debug(`Executing task ${record.msg_id}...`);
      await this.messageHandler(record.message!);

      this.logger.debug(
        `Task ${record.msg_id} completed successfully, archiving...`
      );
      await this.queue.archive(record.msg_id);
      this.logger.debug(`Archived task ${record.msg_id} successfully`);

      // TODO: uncomment when ready to debug this
    } catch (error) {
      await this.handleExecutionError(error, record);
    } finally {
      this.currentMsgId = null;
    }
  }

  private async handleExecutionError(error: unknown, record: MessageRecord<MessagePayload>) {
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.debug(`Aborted execution for ${record.msg_id}`);
      // Do not throw - the worker was aborted and stopping,
      // the message will reappear after the visibility timeout
      // and be picked up by another worker
    } else {
      this.logger.debug(`Task ${record.msg_id} failed with error: ${error}`);
      await this.retryOrArchive(record);
    }
  }

  private async retryOrArchive(record: MessageRecord<MessagePayload>) {
    if (this.retryAvailable(record)) {
      // adjust visibility timeout for message to appear after retryDelay
      this.logger.debug(`Retrying ${record.msg_id} in ${this.retryDelay} seconds`);
      await this.queue.setVt(record.msg_id, this.retryDelay);
    } else {
      // archive message forever and stop processing it
      // TODO: set 'permanently_failed' in headers when pgmq 1.5.0 is released
      this.logger.debug(`Archiving ${record.msg_id} forever`);
      await this.queue.archive(record.msg_id);
    }
  }

  private retryAvailable(record: MessageRecord<MessagePayload>) {
    const readCountLimit = this.retryLimit + 1; // initial read also counts
    return record.read_ct < readCountLimit;
  }
}
