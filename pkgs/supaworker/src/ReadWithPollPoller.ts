import { Queue } from './Queue.ts';
import { Json, MessageRecord } from './types.ts';

export interface PollerConfig {
  batchSize: number;
  visibilityTimeout: number;
  maxPollSeconds: number;
  pollIntervalMs: number;
}

export class ReadWithPollPoller<MessagePayload extends Json> {
  constructor(
    protected readonly queue: Queue<MessagePayload>,
    protected readonly config: PollerConfig,
    protected readonly signal: AbortSignal
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
