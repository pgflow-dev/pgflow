import { postgres } from "../sql.ts";
import { Json } from "../Flow.ts";
import { MessageExecutor } from "./MessageExecutor.ts";
import { Queue } from "./Queue.ts";

// @ts-ignore - TODO: fix the types
const waitUntil = EdgeRuntime.waitUntil;

export interface MessageRecord<MessagePayload extends Json> {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: MessagePayload | null;
}

export interface WorkerConfig {
  postgresql: string;
  queueName: string;
  batchSize?: number;
  visibilityTimeout?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
}

export class Worker<MessagePayload extends Json> {
  private mainController: AbortController;
  private isRunning = false;
  private queue: Queue<MessagePayload>;
  private activeExecutors: Map<number, MessageExecutor<MessagePayload>>;
  private batchSize: number;
  private visibilityTimeout: number;
  private maxPollSeconds: number;
  private pollIntervalMs: number;

  constructor(config: WorkerConfig) {
    this.mainController = new AbortController();
    this.activeExecutors = new Map();
    this.queue = new Queue(
      postgres(config.postgresql, { max: 4 }),
      config.queueName,
    );
    this.batchSize = config.batchSize || 50;
    this.visibilityTimeout = config.visibilityTimeout || 5;
    this.maxPollSeconds = config.maxPollSeconds || 2;
    this.pollIntervalMs = config.pollIntervalMs || 100;
  }

  startAndWait(messageHandler: (message: MessagePayload) => Promise<void>) {
    // @ts-ignore - Using Edge Runtime
    waitUntil(this.start(messageHandler));
  }

  private async executeMessage(
    record: MessageRecord<MessagePayload>,
    messageHandler: (message: MessagePayload) => Promise<void>,
  ): Promise<void> {
    const executor = new MessageExecutor(this.queue, record, messageHandler);

    this.activeExecutors.set(executor.msgId, executor);

    try {
      await executor.execute();
    } finally {
      this.activeExecutors.delete(executor.msgId);
    }
  }

  async start(messageHandler: (message: MessagePayload) => Promise<void>) {
    if (this.isRunning) {
      console.log("Worker already running");
      return;
    }

    this.isRunning = true;
    console.log("Worker started");

    while (!this.mainController.signal.aborted) {
      try {
        console.log("Polling for ");
        const messageRecords = await this.queue.readWithPoll(
          this.batchSize,
          this.visibilityTimeout,
          this.maxPollSeconds,
          this.pollIntervalMs,
        );

        for (const messageRecord of messageRecords) {
          // @ts-ignore - Using Edge Runtime
          waitUntil(this.executeMessage(messageRecord, messageHandler));
        }
      } catch (error: unknown) {
        console.error("Error processing messages:", error);
      }
    }

    await this.queue.end();
    this.isRunning = false;
    console.log("Worker stopped");
  }

  stop() {
    for (const executor of this.activeExecutors.values()) {
      executor.abort();
    }
    this.activeExecutors.clear();
    this.mainController.abort();
  }
}
