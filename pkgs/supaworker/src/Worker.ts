import postgres from 'postgres';
import { Json, MessageRecord } from './types.ts';
import { Queue } from './Queue.ts';
import { Queries } from './Queries.ts';
import {
  ExecutionController,
  type ExecutionConfig,
} from './ExecutionController.ts';
import { Logger } from './Logger.ts';
import { WorkerLifecycle, type LifecycleConfig } from './WorkerLifecycle.ts';
import { PollerConfig, ReadWithPollPoller } from './ReadWithPollPoller.ts';

export interface WorkerConfig
  extends ExecutionConfig,
    LifecycleConfig,
    PollerConfig {
  // required
  connectionString: string;

  // optional
  maxPgConnections?: number;
}

export class Worker<MessagePayload extends Json> {
  private config: Required<WorkerConfig>;
  private executionController: ExecutionController<MessagePayload>;
  private lifecycle: WorkerLifecycle;
  private logger: Logger;
  private abortController = new AbortController();
  private poller: ReadWithPollPoller<MessagePayload>;
  private sql: postgres.Sql;
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

    this.logger = new Logger();
    this.sql = postgres(this.config.connectionString, {
      max: this.config.maxPgConnections,
      prepare: true,
    });

    const queue = new Queue<MessagePayload>(this.sql, this.config.queueName);
    const queries = new Queries(this.sql);

    this.lifecycle = new WorkerLifecycle(queries, this.logger, {
      queueName: this.config.queueName,
    });

    this.executionController = new ExecutionController<MessagePayload>(
      queue,
      this.abortSignal,
      {
        maxConcurrent: this.config.maxConcurrent,
        retryLimit: this.config.retryLimit,
        retryDelay: this.config.retryDelay,
      }
    );

    this.poller = new ReadWithPollPoller(queue, this.abortSignal, {
      batchSize: this.config.maxConcurrent,
      maxPollSeconds: this.config.maxPollSeconds,
      pollIntervalMs: this.config.pollIntervalMs,
      visibilityTimeout: this.config.visibilityTimeout,
    });
  }

  async start(messageHandler: (message: MessagePayload) => Promise<void>) {
    try {
      await this.lifecycle.acknowledgeStart();

      while (this.isMainLoopActive) {
        try {
          await this.lifecycle.sendHeartbeat(this.edgeFunctionName);

          const messageRecords = await this.poller.poll();

          if (this.isAborted) {
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
      this.abortController.abort();

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
    return this.lifecycle.isRunning() && !this.isAborted;
  }

  private get abortSignal() {
    return this.abortController.signal;
  }

  private get isAborted() {
    return this.abortController.signal.aborted;
  }
}
