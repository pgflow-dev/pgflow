import type { Queue } from './Queue.ts';
import type { Json, MessageRecord } from './types.ts';

export interface PollerConfig {
  batchSize: number;
  maxPollSeconds: number;
  pollIntervalMs: number;
  visibilityTimeout: number;
}

export class ReadWithPollPoller<MessagePayload extends Json> {
  constructor(
    protected readonly queue: Queue<MessagePayload>,
    protected readonly signal: AbortSignal,
    protected readonly config: PollerConfig
  ) {}

  async poll(): Promise<MessageRecord<MessagePayload>[]> {
    if (this.isAborted()) {
      return [];
    }

    return await this.queue.readWithPoll(
      this.config.batchSize,
      this.config.visibilityTimeout,
      this.config.maxPollSeconds,
      this.config.pollIntervalMs
    );
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}
