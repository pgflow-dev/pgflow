export class ListenNotifyPoller<
  MessagePayload extends Json
> extends MessagePolling<MessagePayload> {
  private notifyPromise: Promise<void>;
  private notifyWakeup!: () => void;
  private cleaning = false;

  constructor(
    queue: Queue<MessagePayload>,
    config: PollingConfig,
    signal: AbortSignal
  ) {
    super(queue, config, signal);

    // First setup notification handler
    this.queue.client.on('notification', () => {
      this.notifyWakeup();
    });

    // Then setup initial promise
    const { promise, resolve } = Promise.withResolvers<void>();
    this.notifyPromise = promise;
    this.notifyWakeup = resolve;

    // Setup cleanup on abort
    this.signal.addEventListener('abort', () => {
      this.cleanup();
    });

    // Finally LISTEN - now we won't miss any notifications
    this.queue.client.query(`LISTEN "${this.queue.queueName}_notify"`);
  }

  async poll(): Promise<MessageRecord<MessagePayload>[]> {
    if (this.signal.aborted || this.cleaning) return [];

    // Create next promise before waiting
    const { promise, resolve } = Promise.withResolvers<void>();
    const currentPromise = this.notifyPromise;
    this.notifyPromise = promise;
    this.notifyWakeup = resolve;

    // Wait for either notification or timeout
    await Promise.race([
      currentPromise,
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);

    // Check again before read
    if (this.signal.aborted || this.cleaning) return [];

    return await this.queue.read(
      this.config.maxConcurrent,
      this.config.visibilityTimeout
    );
  }

  private async cleanup() {
    this.cleaning = true;
    this.notifyWakeup(); // wake up any waiting poll
    await this.queue.client.query(`UNLISTEN "${this.queue.queueName}_notify"`);
  }
}
