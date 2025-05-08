import type { Queue } from './Queue.ts';
import type { PgmqMessageRecord } from './types.ts';
import type { Json } from '../core/types.ts';
import type { Logger } from '../platform/types.ts';

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

  async poll(): Promise<PgmqMessageRecord<TPayload>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    this.logger.debug(`Polling queue '${this.queue.queueName}' with batch size ${this.config.batchSize}`);
    const messages = await this.queue.readWithPoll(
      this.config.batchSize,
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
