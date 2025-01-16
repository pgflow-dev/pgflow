import postgres from 'postgres';
import { Json, MessageRecord } from './types.ts';
import { Queue } from './Queue.ts';
import { Queries } from './Queries.ts';
import { ExecutionController } from './ExecutionController.ts';
import { Logger } from './Logger.ts';
import { WorkerLifecycle } from './WorkerLifecycle.ts';
import { ReadWithPollPoller } from './ReadWithPollPoller.ts';

export interface WorkerConfig {
  connectionString: string;
  maxConcurrent?: number;
  maxPgConnections?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
  queueName: string;
  retryDelay?: number;
  retryLimit?: number;
  visibilityTimeout?: number;
}

export class Worker<MessagePayload extends Json> {
  public edgeFunctionName?: string;
  private config: Required<WorkerConfig>;
  private executionController: ExecutionController<MessagePayload>;
  private lifecycle: WorkerLifecycle;
  private logger: Logger;
  private mainController = new AbortController();
  private poller: ReadWithPollPoller<MessagePayload>;
  private sql: postgres.Sql;

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

    this.logger = new Logger();
    this.sql = postgres(this.config.connectionString, {
      max: this.config.maxPgConnections,
      prepare: true,
    });

    const queue = new Queue<MessagePayload>(this.sql, this.config.queueName);
    const queries = new Queries(this.sql);

    this.lifecycle = new WorkerLifecycle(
      this.config.queueName,
      queries,
      this.logger
    );

    this.executionController = new ExecutionController<MessagePayload>(
      queue,
      this.mainController.signal,
      this.config.maxConcurrent,
      this.config.retryLimit,
      this.config.retryDelay
    );
    const pollerConfig = {
      batchSize: this.config.maxConcurrent,
      maxPollSeconds: this.config.maxPollSeconds,
      pollIntervalMs: this.config.pollIntervalMs,
      visibilityTimeout: this.config.visibilityTimeout,
    };

    this.poller = new ReadWithPollPoller(
      queue,
      this.mainController.signal,
      pollerConfig
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
