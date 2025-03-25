import type postgres from 'postgres';
import type { ILifecycle, Json, WorkerBootstrap } from './types.ts';
import type {
  ExecutionConfig,
} from './ExecutionController.ts';
import { getLogger, setupLogger } from './Logger.ts';
import type { WorkerLifecycle, LifecycleConfig } from './WorkerLifecycle.ts';
import type { PollerConfig } from './ReadWithPollPoller.ts';
import type { BatchProcessor } from './BatchProcessor.ts';

export type WorkerConfig = {
  sql: postgres.Sql;
} & Partial<ExecutionConfig> &
  Partial<LifecycleConfig> &
  Partial<Omit<PollerConfig, 'batchSize'>>;

export class Worker<TMessage extends Json> {
  private config: Required<WorkerConfig>;
  private lifecycle: ILifecycle;
  private logger = getLogger('Worker');
  private abortController = new AbortController();

  private batchProcessor: BatchProcessor<TMessage>;
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
    batchProcessor: BatchProcessor<TMessage>,
    lifecycle: ILifecycle,
    configOverrides: WorkerConfig
  ) {
    this.config = {
      ...Worker.DEFAULT_CONFIG,
      ...configOverrides,
    };

    this.sql = this.config.sql;

    this.lifecycle = lifecycle;

    this.batchProcessor = batchProcessor;
  }

  async startOnlyOnce(workerBootstrap: WorkerBootstrap) {
    if (this.lifecycle.isRunning) {
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
          await this.batchProcessor.processBatch();
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
    // If the worker is already stopping or stopped, do nothing
    if (this.lifecycle.isStopping || this.lifecycle.isStopped) {
      return;
    }

    this.lifecycle.transitionToStopping();

    try {
      this.logger.info('-> Stopped accepting new messages');
      this.abortController.abort();

      this.logger.info('-> Waiting for pending tasks to complete...');
      await this.batchProcessor.awaitCompletion();
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
    return this.lifecycle.isRunning && !this.isAborted;
  }

  private get abortSignal() {
    return this.abortController.signal;
  }

  private get isAborted() {
    return this.abortController.signal.aborted;
  }
}
