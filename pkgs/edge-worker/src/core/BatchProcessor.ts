import type { ExecutionController } from './ExecutionController.js';
import type { IMessage, IPoller } from './types.js';
import { getLogger } from './Logger.js';

export class BatchProcessor<TMessage extends IMessage> {
  private logger = getLogger('BatchProcessor');

  constructor(
    private executionController: ExecutionController<TMessage>,
    private poller: IPoller<TMessage>,
    private signal: AbortSignal
  ) {
    this.executionController = executionController;
    this.signal = signal;
    this.poller = poller;
  }

  async processBatch() {
    this.logger.debug('Polling for new batch of messages...');
    const messageRecords = await this.poller.poll();

    if (this.signal.aborted) {
      this.logger.info('Discarding messageRecords because worker is stopping');
      return;
    }

    this.logger.debug(`Starting ${messageRecords.length} messages`);

    const startPromises = messageRecords.map((message) =>
      this.executionController.start(message)
    );
    await Promise.all(startPromises);
  }

  async awaitCompletion() {
    return await this.executionController.awaitCompletion();
  }
}
