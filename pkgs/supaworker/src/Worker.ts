import postgres from 'postgres';
import { Json } from './types.ts';
import { Queue } from './Queue.ts';
import { Queries } from './Queries.ts';
import { Heartbeat } from './Heartbeat.ts';
// import { SimpleExecutionController as ExecutionController } from './SimpleExecutionController.ts';
import { ExecutionController } from './ExecutionController.ts';
import { Logger } from './Logger.ts';

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
  visibilityTimeout?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
  maxPgConnections?: number;
  maxConcurrent?: number;
}

export class Worker<MessagePayload extends Json> {
  private mainController = new AbortController();
  private isRunning = false;
  private sql: postgres.Sql;
  private queue: Queue<MessagePayload>;
  private queries: Queries;
  private executionController: ExecutionController<MessagePayload>;
  private workerId?: string;
  private heartbeat?: Heartbeat;
  private config: Required<WorkerConfig>;
  private logger = new Logger();
  public edgeFunctionName?: string;

  constructor(config: WorkerConfig) {
    this.config = {
      connectionString: config.connectionString,
      queueName: config.queueName,
      visibilityTimeout: config.visibilityTimeout ?? 1,
      maxPollSeconds: config.maxPollSeconds ?? 5,
      pollIntervalMs: config.pollIntervalMs ?? 100,
      maxPgConnections: config.maxPgConnections ?? 4,
      maxConcurrent: config.maxConcurrent ?? 50,
    };

    this.sql = postgres(this.config.connectionString, {
      max: this.config.maxPgConnections,
      prepare: false,
    });
    this.queue = new Queue(this.sql, this.config.queueName);
    this.queries = new Queries(this.sql);
    // this.executionController = new ExecutionController(
    //   this.config.maxConcurrent
    // );
    this.executionController = new ExecutionController(
      this.queue,
      this.mainController.signal,
      this.config.maxConcurrent
    );
  }

  private log(message: string) {
    this.logger.log(message);
  }

  private async acknowledgeStart() {
    const worker = await this.queries.onWorkerStarted(this.config.queueName);

    this.workerId = worker.worker_id;
    this.logger.setWorkerId(this.workerId);
    this.isRunning = true;
    this.heartbeat = new Heartbeat(
      5000,
      this.queries,
      this.workerId,
      this.log.bind(this)
    );

    this.log('Worker started');
  }

  private async acknowledgeStop() {
    if (!this.workerId || !this.isRunning) {
      throw new Error('Cannot stop worker: not started!');
    }
    console.log('onWorkerStopped >>>>');
    await this.queries.onWorkerStopped(this.workerId);
    console.log('<<<< onWorkerStopped');
  }

  async start(messageHandler: (message: MessagePayload) => Promise<void>) {
    if (this.isRunning) {
      this.log('Worker already running');
      return;
    }

    await this.acknowledgeStart();

    console.log('worker main loop started');
    while (!this.mainController.signal.aborted) {
      try {
        await this.heartbeat?.send(this.edgeFunctionName);

        // Start all executions for this batch before next iteration
        const messageRecords = !this.mainController.signal.aborted
          ? await this.queue.readWithPoll(
              this.config.maxConcurrent,
              this.config.visibilityTimeout,
              this.config.maxPollSeconds,
              this.config.pollIntervalMs
            )
          : [];

        if (this.mainController.signal.aborted) {
          this.log('-> Discarding messageRecords because worker is stopping');
          continue;
        }

        // Start all executions and wait for them to be tracked
        const startPromises = messageRecords.map((messageRecord) =>
          this.executionController.start(messageRecord, messageHandler)
        );
        console.log('startPromises');
        await Promise.all(startPromises);
        console.log('after startPromises');
      } catch (error: unknown) {
        console.error('Error processing messages:', error);
      }
    }
    this.isRunning = false;
    this.log('Worker main loop stopped');
  }

  async stop() {
    this.log('STOPPING Worker...');

    this.log('-> Stopped accepting new messages');
    this.mainController.abort();

    console.log('-> Waiting for execution completion');
    await this.executionController.awaitCompletion();
    console.log('-> Execution completed');

    // Now safe to close connection
    await this.acknowledgeStop();
    await this.sql.end();
  }

  setFunctionName(functionName: string) {
    this.edgeFunctionName = functionName;
  }
}
