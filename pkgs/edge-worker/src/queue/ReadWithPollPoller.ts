import type { Queue } from './Queue.ts';
import type { PgmqMessageRecord } from './types.ts';
import type { Json } from '../core/types.ts';

export interface PollerConfig {
  batchSize: number;
  maxPollSeconds: number;
  pollIntervalMs: number;
  visibilityTimeout: number;
}

export class ReadWithPollPoller<TPayload extends Json> {
  constructor(
    protected readonly queue: Queue<TPayload>,
    protected readonly signal: AbortSignal,
    protected readonly config: PollerConfig
  ) {}

  async poll(): Promise<PgmqMessageRecord<TPayload>[]> {
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
