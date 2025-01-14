import { Queue } from './Queue.ts';
import { Json } from './types.ts';

interface BatchConfig {
  batchSize?: number;
  timeoutMs?: number;
}

export class BatchArchiver<MessagePayload extends Json> {
  private pending = new Set<number>();
  private timeoutId?: number;
  private config: Required<BatchConfig>;

  constructor(private queue: Queue<MessagePayload>, config: BatchConfig = {}) {
    this.config = {
      batchSize: 100,
      timeoutMs: 1000,
      ...config,
    };
  }

  async add(msgId: number): Promise<void> {
    this.pending.add(msgId);
    await this.archiveImmediatelyOrSchedule();
  }

  private clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  private async archiveImmediatelyOrSchedule(): Promise<void> {
    if (this.pending.size >= this.config.batchSize) {
      this.clearTimeout();
      await this.archiveBatch();
    } else {
      this.setupTimeout();
    }
  }

  private setupTimeout() {
    if (this.timeoutId) return;

    this.timeoutId = setTimeout(async () => {
      this.clearTimeout();
      try {
        await this.archiveBatch();
      } catch (error) {
        console.error('Timeout-triggered archive failed:', error);
      }
    }, this.config.timeoutMs);
  }

  private async archiveBatch(): Promise<void> {
    if (this.pending.size === 0) return;

    const batch = Array.from(this.pending);

    try {
      await this.queue.archiveBatch(batch);
      this.pending.clear();
    } catch (error) {
      console.error('Failed to archive batch:', error);
      throw error;
    }
  }
}
