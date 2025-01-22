import { ExecutionController } from './ExecutionController.ts';
import { Queue } from './Queue.ts';
import { PollerConfig, ReadWithPollPoller } from './ReadWithPollPoller.ts';
import { Json, MessageRecord } from './types.ts';
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

  async processBatch(
    messageHandler: (message: MessagePayload) => Promise<void>
  ) {
    const messageRecords = await this.poller.poll();

    if (this.signal.aborted) {
      this.logger.info(
        '-> Discarding messageRecords because worker is stopping'
      );
      return;
    }

    const startPromises = messageRecords.map(
      (messageRecord: MessageRecord<MessagePayload>) =>
        this.executionController.start(messageRecord, messageHandler)
    );
    await Promise.all(startPromises);
  }
}
