import postgres from 'postgres';
import { Json } from './types.ts';
import { Queue } from './Queue.ts';
import { Queries } from './Queries.ts';
import { Heartbeat } from './Heartbeat.ts';
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
  retryLimit?: number;
  retryDelay?: number;
}

export enum WorkerState {
  Idle = 'idle',
  Starting = 'starting',
  Running = 'running',
  Stopping = 'stopping',
}

export class Worker<MessagePayload extends Json> {
  private mainController = new AbortController();
  private workerState: WorkerState = WorkerState.Idle;
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
      visibilityTimeout: config.visibilityTimeout ?? 3,
      maxPollSeconds: config.maxPollSeconds ?? 5,
      pollIntervalMs: config.pollIntervalMs ?? 100,
      maxPgConnections: config.maxPgConnections ?? 4,
      maxConcurrent: config.maxConcurrent ?? 50,
      retryLimit: config.retryLimit ?? 0,
      retryDelay: config.retryDelay ?? 2000,
    };

    this.sql = postgres(this.config.connectionString, {
      max: this.config.maxPgConnections,
      prepare: false,
    });
    this.queue = new Queue(this.sql, this.config.queueName);
    this.queries = new Queries(this.sql);
    this.executionController = new ExecutionController(
      this.queue,
      this.mainController.signal,
      this.config.maxConcurrent,
      this.config.retryLimit,
      this.config.retryDelay
    );
  }

  private log(message: string) {
    this.logger.log(message);
  }

  private async acknowledgeStart() {
    if (this.workerState !== WorkerState.Idle) {
      throw new Error(`Cannot start worker in state: ${this.workerState}`);
    }

    this.workerState = WorkerState.Starting;
    const worker = await this.queries.onWorkerStarted(this.config.queueName);

    this.workerId = worker.worker_id;
    this.logger.setWorkerId(this.workerId);
    this.workerState = WorkerState.Running;
    this.heartbeat = new Heartbeat(
      5000,
      this.queries,
      this.workerId,
      this.log.bind(this)
    );

    this.log('Worker started');
  }

  private async acknowledgeStop() {
    if (!this.workerId) {
      throw new Error('Cannot stop worker: workerId not set');
    }

    if (this.workerState !== WorkerState.Stopping) {
      throw new Error(`Cannot acknowledge stop in state: ${this.workerState}`);
    }

    try {
      this.log('Acknowledging worker stop...');
      await this.queries.onWorkerStopped(this.workerId);
      this.workerState = WorkerState.Idle;
      this.log('Worker stop acknowledged');
    } catch (error) {
      this.log(`Error acknowledging worker stop: ${error}`);
      throw error;
    }
  }

  async start(messageHandler: (message: MessagePayload) => Promise<void>) {
    if (this.workerState !== WorkerState.Idle) {
      const error = new Error(
        `Cannot start worker in state: ${this.workerState}`
      );
      this.log(error.message);
      throw error;
    }

    try {
      await this.acknowledgeStart();

      this.log('Worker main loop started');
      while (
        this.workerState === WorkerState.Running &&
        !this.mainController.signal.aborted
      ) {
        try {
          await this.heartbeat?.send(this.edgeFunctionName);

          const messageRecords = !this.mainController.signal.aborted
            ? await this.queue.readWithPoll(
                this.config.maxConcurrent,
                this.config.visibilityTimeout,
                this.config.maxPollSeconds,
                this.config.pollIntervalMs
              )
            : [];
          console.log('messageRecords', messageRecords);
          console.log('aborted', this.mainController.signal.aborted);

          if (this.mainController.signal.aborted) {
            this.log('-> Discarding messageRecords because worker is stopping');
            continue;
          }

          const startPromises = messageRecords.map((messageRecord: any) =>
            this.executionController.start(messageRecord, messageHandler)
          );
          await Promise.all(startPromises);
        } catch (error: unknown) {
          this.log(`Error processing messages: ${error}`);
        }
      }
    } catch (error) {
      this.log(`Error in worker main loop: ${error}`);
      throw error;
    }
  }

  async stop() {
    if (this.workerState !== WorkerState.Running) {
      throw new Error(`Cannot stop worker in state: ${this.workerState}`);
    }

    this.log('STOPPING Worker...');
    this.workerState = WorkerState.Stopping;

    try {
      this.log('-> Stopped accepting new messages');
      this.mainController.abort();

      this.log('-> Waiting for execution completion');
      await this.executionController.awaitCompletion();
      this.log('-> Execution completed');

      await this.acknowledgeStop();
      await this.sql.end();
    } catch (error) {
      this.log(`Error during worker stop: ${error}`);
      throw error;
    }
  }

  setFunctionName(functionName: string) {
    this.edgeFunctionName = functionName;
  }
}
