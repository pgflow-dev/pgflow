import type { Json, MessageRecord } from '../types.ts';
import type { Queue } from '../Queue.ts';
import type { Poller } from '../interfaces/Poller.ts';
import { getLogger } from '../Logger.ts';

export interface PgmqPollerConfig {
  batchSize: number;
  maxPollSeconds: number;
  pollIntervalMs: number;
  visibilityTimeout: number;
}

/**
 * Implementation of Poller for PGMQ
 */
export class PgmqPoller<MessagePayload extends Json> implements Poller<MessageRecord<MessagePayload>> {
  private logger = getLogger('PgmqPoller');

  constructor(
    protected readonly queue: Queue<MessagePayload>,
    protected readonly signal: AbortSignal,
    protected readonly config: PgmqPollerConfig
  ) {}

  async poll(): Promise<MessageRecord<MessagePayload>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted');
      return [];
    }

    this.logger.debug('Polling for messages...');
    const messages = await this.queue.readWithPoll(
      this.config.batchSize,
      this.config.visibilityTimeout,
      this.config.maxPollSeconds,
      this.config.pollIntervalMs
    );
    
    this.logger.debug(`Polled ${messages.length} messages`);
    return messages;
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}