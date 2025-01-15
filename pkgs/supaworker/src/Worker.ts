import postgres from 'postgres';
import { Json, MessageRecord } from './types.ts';
import { Queue } from './Queue.ts';
import { Queries } from './Queries.ts';
import { Heartbeat } from './Heartbeat.ts';
import { ExecutionController } from './ExecutionController.ts';
import { Logger } from './Logger.ts';
import { WorkerState, States } from './WorkerState.ts';
import { ReadWithPollPoller } from './ReadWithPollPoller.ts';

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

export class Worker<MessagePayload extends Json> {
  private mainController = new AbortController();
  private workerState: WorkerState = new WorkerState();
  private sql: postgres.Sql;
  private queue: Queue<MessagePayload>;
  private queries: Queries;
  private executionController: ExecutionController<MessagePayload>;
  private poller: ReadWithPollPoller<MessagePayload>;
  private workerId?: string;
  private heartbeat?: Heartbeat;
  private config: Required<WorkerConfig>;
  private logger = new Logger();
  public edgeFunctionName?: string;

  private static readonly DEFAULT_CONFIG = {
    maxConcurrent: 50,
    maxPgConnections: 4,
    maxPollSeconds: 5,
    pollIntervalMs: 100,
    retryDelay: 5,
    retryLimit: 0,
    visibilityTimeout: 3,
  } as const;

  constructor(configOverrides: WorkerConfig) {
    this.config = {
      ...Worker.DEFAULT_CONFIG,
      ...configOverrides,
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
    this.poller = new ReadWithPollPoller(
      this.queue,
      {
        batchSize: this.config.maxConcurrent,
        visibilityTimeout: this.config.visibilityTimeout,
        maxPollSeconds: this.config.maxPollSeconds,
        pollIntervalMs: this.config.pollIntervalMs,
      },
      this.mainController.signal
    );
  }

  async start(messageHandler: (message: MessagePayload) => Promise<void>) {
    try {
      await this.acknowledgeStart();

      while (this.isMainLoopActive) {
        try {
          await this.heartbeat?.send(this.edgeFunctionName);

          const messageRecords = await this.poller.poll();

          if (this.mainController.signal.aborted) {
            this.log('-> Discarding messageRecords because worker is stopping');
            continue;
          }

          const startPromises = messageRecords.map(
            (messageRecord: MessageRecord<MessagePayload>) =>
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

  private log(message: string) {
    this.logger.log(message);
  }

  private async acknowledgeStart() {
    this.workerState.transitionTo(States.Starting);

    const worker = await this.queries.onWorkerStarted(this.config.queueName);

    this.workerId = worker.worker_id;
    this.logger.setWorkerId(this.workerId);

    this.heartbeat = new Heartbeat(
      5000,
      this.queries,
      this.workerId,
      this.log.bind(this)
    );

    this.workerState.transitionTo(States.Running);

    this.log('Worker started');
  }

  private async acknowledgeStop() {
    if (!this.workerId) {
      throw new Error('Cannot stop worker: workerId not set');
    }

    try {
      this.log('Acknowledging worker stop...');

      this.workerState.transitionTo(States.Stopped);
      await this.queries.onWorkerStopped(this.workerId);

      this.log('Worker stop acknowledged');
    } catch (error) {
      this.log(`Error acknowledging worker stop: ${error}`);
      throw error;
    }
  }

  async stop() {
    this.workerState.transitionTo(States.Stopping);

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

  /**
   * Returns true if worker state is Running and worker was not stopped
   */
  private get isMainLoopActive() {
    return this.workerState.isRunning && !this.mainController.signal.aborted;
  }
}
