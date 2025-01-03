import postgres from "postgres";
import { Json } from "./types.ts";
import { MessageExecutor } from "./MessageExecutor.ts";
import { Queue } from "./Queue.ts";
import { Queries } from "./Queries.ts";

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
  connectionString: string;
  queueName: string;
  batchSize?: number;
  visibilityTimeout?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
}

export class Worker<MessagePayload extends Json> {
  private mainController: AbortController;
  private isRunning = false;
  private queueName: string;
  private queue: Queue<MessagePayload>;
  private queries: Queries;
  private activeExecutors: Map<number, MessageExecutor<MessagePayload>>;
  private batchSize: number;
  private visibilityTimeout: number;
  private maxPollSeconds: number;
  private pollIntervalMs: number;
  private sql: postgres.Sql;
  private workerId?: string;

  constructor(config: WorkerConfig) {
    this.sql = postgres(config.connectionString, {
      max: 4,
      prepare: false,
    });
    this.mainController = new AbortController();
    this.activeExecutors = new Map();
    this.queueName = config.queueName;
    this.queue = new Queue(this.sql, config.queueName);
    this.queries = new Queries(this.sql);
    this.batchSize = config.batchSize || 5;
    this.visibilityTimeout = config.visibilityTimeout || 1;
    this.maxPollSeconds = config.maxPollSeconds || 5;
    this.pollIntervalMs = config.pollIntervalMs || 100;
  }

  log(message: string) {
    let label = "starting";
    if (this.workerId) {
      label = this.workerId;
    }

    console.log(`[worker_id=${label}] ${message}`);
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

  async acknowledgeStart() {
    const worker = await this.queries.onWorkerStarted(this.queueName);

    this.workerId = worker.worker_id;
    this.isRunning = true;

    this.log("Worker started");
  }

  async acknowledgeStop() {
    if (!this.workerId || !this.isRunning) {
      throw new Error("Cannot stop worker: not started!");
    }
    console.log("onWorkerStopped >>>>");
    await this.queries.onWorkerStopped(this.workerId);
    console.log("<<<< onWorkerStopped");
  }

  async sendHeartbeat() {
    if (this.workerId) {
      await this.queries.sendHeartbeat(this.workerId);
    }
  }

  private shouldSendHeartbeat(lastHeartbeat: number): boolean {
    return Date.now() - lastHeartbeat >= 5000;
  }

  async start(messageHandler: (message: MessagePayload) => Promise<void>) {
    if (this.isRunning) {
      this.log("Worker already running");
      return;
    }

    await this.acknowledgeStart();

    let lastHeartbeat = 0;

    console.log("worker main loop started");
    while (!this.mainController.signal.aborted) {
      try {
        if (this.shouldSendHeartbeat(lastHeartbeat)) {
          await this.sendHeartbeat();
          this.log("Heartbeat OK");
          lastHeartbeat = Date.now();
        }

        let messageRecords:
          | postgres.RowList<MessageRecord<MessagePayload>[]>
          | [] = [];

        if (!this.mainController.signal.aborted) {
          this.log(`Polling for ${this.maxPollSeconds}s`);
          messageRecords = await this.queue.readWithPoll(
            this.batchSize,
            this.visibilityTimeout,
            this.maxPollSeconds,
            this.pollIntervalMs,
          );
        }

        if (this.mainController.signal.aborted) {
          this.log("-> Discarding messageRecords because worker is stopping");
        } else {
          console.log(" -> messageRecords", messageRecords);

          for (const messageRecord of messageRecords) {
            // @ts-ignore - Using Edge Runtime
            waitUntil(this.executeMessage(messageRecord, messageHandler));
          }
        }
      } catch (error: unknown) {
        console.error("Error processing messages:", error);
      }
    }
    this.isRunning = false;
    this.log("Worker main loop stopped");
  }

  async stop() {
    this.log("STOPPING Worker...");

    this.log("-> Stopped accepting new messages");
    this.mainController.abort();

    // Abort all active executors
    console.log("-> Aborting executors");
    for (const executor of this.activeExecutors.values()) {
      executor.abort();
    }

    // Wait for all executors to finish
    console.log("-> Waiting for executors to finish");
    if (this.activeExecutors.size > 0) {
      await Promise.all(
        Array.from(this.activeExecutors.values()).map((executor) =>
          executor.execute(),
        ),
      );
    }
    console.log("-> Executors finished");

    this.activeExecutors.clear();

    // Now safe to close connection
    await this.acknowledgeStop();
    await this.sql.end();
  }
}
