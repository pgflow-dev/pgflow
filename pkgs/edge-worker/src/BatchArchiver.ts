import { Queue } from './Queue.ts';
import { Json } from './types.ts';
import { getLogger } from './Logger.ts';

interface BatchConfig {
  batchSize?: number;
  timeoutMs?: number;
}

/**
 * A class that manages the archiving of messages in batches.
 */
export class BatchArchiver<MessagePayload extends Json> {
  private logger = getLogger('BatchArchiver');
  private pending = new Set<number>();
  private timeoutId?: number;
  private config: Required<BatchConfig>;

  constructor(private queue: Queue<MessagePayload>, config: BatchConfig = {}) {
    this.config = {
      batchSize: 100,
      timeoutMs: 500,
      ...config,
    };
  }

  /**
   * Adds a message ID to the pending set and schedules an archive for the next batch.
   * @param msgId The message ID to add to the pending set
   * @returns Promise that resolves when the message has been added to the pending set
   */
  async add(msgId: number): Promise<void> {
    this.pending.add(msgId);
    await this.archiveImmediatelyOrSchedule();
  }

  /**
   * Clears any pending timeout.
   */
  private clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  /**
   * Archives the current batch of pending messages immediately if the batch size
   * is less than or equal to the configured batch size.
   *
   * Otherwise, schedules an archive for the next batch.
   */
  private async archiveImmediatelyOrSchedule(): Promise<void> {
    if (this.pending.size >= this.config.batchSize) {
      this.clearTimeout();
      await this.archiveBatch();
    } else {
      this.setupTimeout();
    }
  }

  /**
   * Sets up a timeout to archive the current batch of pending messages.
   *
   * If the timeout is already set, it will clear the existing timeout.
   */
  private setupTimeout() {
    if (this.timeoutId) return;

    this.timeoutId = setTimeout(async () => {
      this.clearTimeout();
      try {
        await this.archiveBatch();
      } catch (error) {
        this.logger.error('Timeout-triggered archive failed:', error);
      }
    }, this.config.timeoutMs);
  }

  /**
   * Archives the current batch of pending message IDs using the queue.
   * Clears the pending set after successful archival.
   *
   * @throws Will throw an error if archiving fails
   * @returns Promise that resolves when the batch has been archived
   * @private
   */
  private async archiveBatch(): Promise<void> {
    if (this.pending.size === 0) return;

    const batch = Array.from(this.pending);

    try {
      await this.queue.archiveBatch(batch);
      this.pending.clear();
    } catch (error) {
      this.logger.error('Failed to archive batch:', error);
      throw error;
    }
  }

  /**
   * Archives all pending messages immediately and cleans up any scheduled timeouts.
   *
   * Used during shutdown to ensure all messages are archived before stopping.
   * @returns Promise that resolves when all pending messages have been archived
   */
  async flush(): Promise<void> {
    this.clearTimeout();
    await this.archiveBatch();
  }
}
