import postgres from 'postgres';
import type { Json, WorkerBootstrap } from './types.ts';
import { Queue } from './Queue.ts';
import { Queries } from './Queries.ts';
import {
  ExecutionController,
  type ExecutionConfig,
} from './ExecutionController.ts';
import { getLogger, setupLogger } from './Logger.ts';
import { WorkerLifecycle, type LifecycleConfig } from './WorkerLifecycle.ts';
import type { PollerConfig } from './ReadWithPollPoller.ts';
import { BatchProcessor } from './BatchProcessor.ts';

export type WorkerConfig = {
  connectionString: string;
  maxPgConnections?: number;
} & Partial<ExecutionConfig> &
  Partial<LifecycleConfig> &
  Partial<Omit<PollerConfig, 'batchSize'>>;

export class Worker<MessagePayload extends Json> {
  private config: Required<WorkerConfig>;
  private executionController: ExecutionController<MessagePayload>;
  private messageHandler: (message: MessagePayload) => Promise<void> | void;
  private lifecycle: WorkerLifecycle<MessagePayload>;
  private logger = getLogger('Worker');
  private abortController = new AbortController();

  private batchProcessor: BatchProcessor<MessagePayload>;
  private sql: postgres.Sql;

  private static readonly DEFAULT_CONFIG = {
    queueName: 'tasks',
    maxConcurrent: 10,
    maxPgConnections: 4,
    maxPollSeconds: 5,
    pollIntervalMs: 200,
    retryDelay: 5,
    retryLimit: 5,
    visibilityTimeout: 3,
  } as const;

  constructor(
    messageHandler: (message: MessagePayload) => Promise<void> | void,
    configOverrides: WorkerConfig
  ) {
    this.config = {
      ...Worker.DEFAULT_CONFIG,
      ...configOverrides,
    };

    this.messageHandler = messageHandler;

    this.sql = postgres(this.config.connectionString, {
      max: this.config.maxPgConnections,
      prepare: true,
    });

    const queue = new Queue<MessagePayload>(this.sql, this.config.queueName);
    const queries = new Queries(this.sql);

    this.lifecycle = new WorkerLifecycle<MessagePayload>(queries, queue);

    this.executionController = new ExecutionController<MessagePayload>(
      queue,
      this.abortSignal,
      {
        maxConcurrent: this.config.maxConcurrent,
        retryLimit: this.config.retryLimit,
        retryDelay: this.config.retryDelay,
      }
    );

    this.batchProcessor = new BatchProcessor(
      this.executionController,
      queue,
      this.abortSignal,
      {
        batchSize: this.config.maxConcurrent,
        maxPollSeconds: this.config.maxPollSeconds,
        pollIntervalMs: this.config.pollIntervalMs,
        visibilityTimeout: this.config.visibilityTimeout,
      }
    );
  }

  async startOnlyOnce(workerBootstrap: WorkerBootstrap) {
    if (this.lifecycle.isRunning()) {
      this.logger.debug('Worker already running, ignoring start request');
      return;
    }

    await this.start(workerBootstrap);
  }

  private async start(workerBootstrap: WorkerBootstrap) {
    setupLogger(workerBootstrap.workerId);

    try {
      await this.lifecycle.acknowledgeStart(workerBootstrap);

      while (this.isMainLoopActive) {
        try {
          await this.lifecycle.sendHeartbeat();
        } catch (error: unknown) {
          this.logger.error(`Error sending heartbeat: ${error}`);
          // Continue execution - a failed heartbeat shouldn't stop processing
        }

        try {
          await this.batchProcessor.processBatch(this.messageHandler);
        } catch (error: unknown) {
          this.logger.error(`Error processing batch: ${error}`);
          // Continue to next iteration - failed batch shouldn't stop the worker
        }
      }
    } catch (error) {
      this.logger.error(`Error in worker main loop: ${error}`);
      throw error;
    }
  }

  async stop() {
    this.lifecycle.transitionToStopping();

    try {
      this.logger.info('-> Stopped accepting new messages');
      this.abortController.abort();

      this.logger.info('-> Waiting for pending tasks to complete...');
      await this.executionController.awaitCompletion();
      this.logger.info('-> Pending tasks completed!');

      this.lifecycle.acknowledgeStop();

      this.logger.info('-> Closing SQL connection...');
      await this.sql.end();
      this.logger.info('-> SQL connection closed!');
    } catch (error) {
      this.logger.info(`Error during worker stop: ${error}`);
      throw error;
    }
  }

  get edgeFunctionName() {
    return this.lifecycle.edgeFunctionName;
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
