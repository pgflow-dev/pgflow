import type { Queue } from './Queue.js';
import type { PgmqMessageRecord } from './types.js';
import type { Json } from '../core/types.js';
import type { Logger } from '../platform/types.js';

export interface PollerConfig {
  batchSize: number;
  maxPollSeconds: number;
  pollIntervalMs: number;
  visibilityTimeout: number;
}

export class ReadWithPollPoller<TPayload extends Json> {
  private logger: Logger;

  constructor(
    protected readonly queue: Queue<TPayload>,
    protected readonly signal: AbortSignal,
    protected readonly config: PollerConfig,
    logger: Logger
  ) {
    this.logger = logger;
  }

  async poll(limit?: number): Promise<PgmqMessageRecord<TPayload>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    const batchSize = limit === undefined
      ? this.config.batchSize
      : Math.min(this.config.batchSize, limit);

    this.logger.debug(`Polling queue '${this.queue.queueName}' with batch size ${batchSize}`);
    const messages = await this.queue.readWithPoll(
      batchSize,
      this.config.visibilityTimeout,
      this.config.maxPollSeconds,
      this.config.pollIntervalMs
    );
    
    this.logger.debug(`Received ${messages.length} messages from queue '${this.queue.queueName}'`);
    return messages;
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}
