import type { ExecutionController } from './ExecutionController.ts';
import type { Queue } from './Queue.ts';
import { type PollerConfig, ReadWithPollPoller } from './ReadWithPollPoller.ts';
import type { Json, MessageRecord } from './types.ts';
import { getLogger } from './Logger.ts';

export class BatchProcessor<MessagePayload extends Json> {
  private logger = getLogger('BatchProcessor');
  private poller: ReadWithPollPoller<MessagePayload>;

  constructor(
    private executionController: ExecutionController<MessagePayload>,
    queue: Queue<MessagePayload>,
    private signal: AbortSignal,
    config: PollerConfig
  ) {
    this.executionController = executionController;
    this.signal = signal;

    this.poller = new ReadWithPollPoller(queue, signal, {
      batchSize: config.batchSize,
      maxPollSeconds: config.maxPollSeconds,
      pollIntervalMs: config.pollIntervalMs,
      visibilityTimeout: config.visibilityTimeout,
    });
  }

  async processBatch() {
    this.logger.debug('Polling for new batch of messages...');
    const messageRecords = await this.poller.poll();

    if (this.signal.aborted) {
      this.logger.info('Discarding messageRecords because worker is stopping');
      return;
    }

    this.logger.debug(`Starting ${messageRecords.length} messages`);

    const startPromises = messageRecords.map(
      (messageRecord: MessageRecord<MessagePayload>) =>
        this.executionController.start(messageRecord)
    );
    await Promise.all(startPromises);
  }

  async awaitCompletion() {
    return await this.executionController.awaitCompletion();
  }
}
