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
    this.logger.polling();
    const messageRecords = await this.poller.poll();

    if (this.signal.aborted) {
      this.logger.info('Discarding messageRecords because worker is stopping');
      return;
    }

    this.logger.taskCount(messageRecords.length);

    const startPromises = messageRecords.map((message) =>
      this.executionController.start(message)
    );
    await Promise.all(startPromises);
  }

  async awaitCompletion() {
    return await this.executionController.awaitCompletion();
  }
}
