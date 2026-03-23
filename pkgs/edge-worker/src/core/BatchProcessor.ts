import type { ExecutionController } from './ExecutionController.js';
import type { IMessage, IPoller } from './types.js';
import type { Logger } from '../platform/types.js';

export class BatchProcessor<TMessage extends IMessage> {
  private logger: Logger;

  constructor(
    private executionController: ExecutionController<TMessage>,
    private poller: IPoller<TMessage>,
    private signal: AbortSignal,
    logger: Logger
  ) {
    this.executionController = executionController;
    this.signal = signal;
    this.poller = poller;
    this.logger = logger;
  }

  async processBatch() {
    const availableSlots = this.executionController.availableSlots;
    if (availableSlots <= 0) {
      await this.executionController.waitForSlot();
      return;
    }

    this.logger.polling();
    const messageRecords = await this.poller.poll(availableSlots);

    if (this.signal.aborted) {
      this.logger.info('Discarding messageRecords because worker is stopping');
      return;
    }

    this.logger.taskCount(messageRecords.length);

    for (const message of messageRecords) {
      try {
        void this.executionController.start(message).catch(() => {
          // ExecutionController already logs task failures; swallow here so
          // refilling the next slot does not produce unhandled rejections.
        });
      } catch (error) {
        this.logger.error('Failed to schedule task execution', error);
      }
    }
  }

  async awaitCompletion() {
    return await this.executionController.awaitCompletion();
  }
}
