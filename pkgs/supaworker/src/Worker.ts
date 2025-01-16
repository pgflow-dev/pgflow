import postgres from 'postgres';
import { Json, MessageRecord } from './types.ts';
import { Queue } from './Queue.ts';
import { Queries } from './Queries.ts';
import { Heartbeat } from './Heartbeat.ts';
import { ExecutionController } from './ExecutionController.ts';
import { Logger } from './Logger.ts';
import { WorkerLifecycle } from './WorkerLifecycle.ts';
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
  private sql: postgres.Sql;
  private queue: Queue<MessagePayload>;
  private queries: Queries;
  private executionController: ExecutionController<MessagePayload>;
  private poller: ReadWithPollPoller<MessagePayload>;
  private config: Required<WorkerConfig>;
  private logger = new Logger();
  private lifecycle: WorkerLifecycle;
  public edgeFunctionName?: string;

  private static readonly DEFAULT_CONFIG = {
    maxConcurrent: 20,
    maxPgConnections: 4,
    maxPollSeconds: 5,
    pollIntervalMs: 200,
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
      prepare: true,
    });
    this.queue = new Queue(this.sql, this.config.queueName);
    this.queries = new Queries(this.sql);
    this.logger = new Logger();
    this.lifecycle = new WorkerLifecycle(
      this.config.queueName,
      this.queries,
      this.logger
    );

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
      await this.lifecycle.acknowledgeStart();

      while (this.isMainLoopActive) {
        try {
          await this.lifecycle.sendHeartbeat(this.edgeFunctionName);

          const messageRecords = await this.poller.poll();

          if (this.mainController.signal.aborted) {
            this.logger.log(
              '-> Discarding messageRecords because worker is stopping'
            );
            continue;
          }

          const startPromises = messageRecords.map(
            (messageRecord: MessageRecord<MessagePayload>) =>
              this.executionController.start(messageRecord, messageHandler)
          );
          await Promise.all(startPromises);
        } catch (error: unknown) {
          this.logger.log(`Error processing messages: ${error}`);
        }
      }
    } catch (error) {
      this.logger.log(`Error in worker main loop: ${error}`);
      throw error;
    }
  }

  async stop() {
    this.lifecycle.transitionToStopping();

    try {
      this.logger.log('-> Stopped accepting new messages');
      this.mainController.abort();

      this.logger.log('-> Waiting for execution completion');
      await this.executionController.awaitCompletion();
      this.logger.log('-> Execution completed');

      await this.lifecycle.acknowledgeStop();
      await this.sql.end();
    } catch (error) {
      this.logger.log(`Error during worker stop: ${error}`);
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
    return this.lifecycle.isRunning() && !this.mainController.signal.aborted;
  }
}
