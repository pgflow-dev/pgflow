import postgres from "postgres";
import { Json } from "./types.ts";
import { Queue } from "./Queue.ts";
import { Queries } from "./Queries.ts";
import { Heartbeat } from "./Heartbeat.ts";
import { ExecutionQueue } from "./ExecutionQueue.ts";
import { Logger } from "./Logger.ts";

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
  maxPgConnections?: number;
}

export class Worker<MessagePayload extends Json> {
  private mainController = new AbortController();
  private isRunning = false;
  private sql: postgres.Sql;
  private queue: Queue<MessagePayload>;
  private queries: Queries;
  private executionQueue: ExecutionQueue<MessagePayload>;
  private workerId?: string;
  private heartbeat?: Heartbeat;
  private config: Required<WorkerConfig>;
  private logger = new Logger();

  constructor(config: WorkerConfig) {
    this.config = {
      connectionString: config.connectionString,
      queueName: config.queueName,
      batchSize: config.batchSize ?? 5,
      visibilityTimeout: config.visibilityTimeout ?? 1,
      maxPollSeconds: config.maxPollSeconds ?? 5,
      pollIntervalMs: config.pollIntervalMs ?? 100,
      maxPgConnections: config.maxPgConnections ?? 4,
    };

    this.sql = postgres(this.config.connectionString, {
      max: this.config.maxPgConnections,
      prepare: false,
    });
    this.queue = new Queue(this.sql, this.config.queueName);
    this.queries = new Queries(this.sql);
    this.executionQueue = new ExecutionQueue(this.queue);
  }

  private log(message: string) {
    this.logger.log(message);
  }

  startAndWait(messageHandler: (message: MessagePayload) => Promise<void>) {
    // @ts-ignore - Using Edge Runtime
    waitUntil(this.start(messageHandler));
  }

  private async executeMessage(
    record: MessageRecord<MessagePayload>,
    messageHandler: (message: MessagePayload) => Promise<void>,
  ): Promise<void> {
    await this.executionQueue.execute(record, messageHandler);
  }

  async acknowledgeStart() {
    const worker = await this.queries.onWorkerStarted(this.config.queueName);

    this.workerId = worker.worker_id;
    this.logger.setWorkerId(this.workerId);
    this.isRunning = true;
    this.heartbeat = new Heartbeat(
      5000,
      this.queries,
      this.workerId,
      this.log.bind(this),
    );

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

  async start(messageHandler: (message: MessagePayload) => Promise<void>) {
    if (this.isRunning) {
      this.log("Worker already running");
      return;
    }

    await this.acknowledgeStart();

    console.log("worker main loop started");
    while (!this.mainController.signal.aborted) {
      try {
        await this.heartbeat?.send();

        let messageRecords:
          | postgres.RowList<MessageRecord<MessagePayload>[]>
          | [] = [];

        if (!this.mainController.signal.aborted) {
          this.log(`Polling for ${this.config.maxPollSeconds}s`);
          messageRecords = await this.queue.readWithPoll(
            this.config.batchSize,
            this.config.visibilityTimeout,
            this.config.maxPollSeconds,
            this.config.pollIntervalMs,
          );
        }

        if (this.mainController.signal.aborted) {
          this.log("-> Discarding messageRecords because worker is stopping");
        } else {
          // console.log(" -> messageRecords", messageRecords);

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

    console.log("-> Aborting executionQueue");
    this.executionQueue.abort();

    console.log("-> Waiting for executionQueue to finish");
    await this.executionQueue.waitForAll();
    console.log("-> ExecutionQueue finished");

    // Now safe to close connection
    await this.acknowledgeStop();
    await this.sql.end();
  }
}
