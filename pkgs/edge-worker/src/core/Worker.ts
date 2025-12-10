import type postgres from 'postgres';
import type { IBatchProcessor, ILifecycle, WorkerBootstrap } from './types.js';
import type { Logger } from '../platform/types.js';

export class Worker {
  private lifecycle: ILifecycle;
  private logger: Logger;
  private abortController = new AbortController();

  private batchProcessor: IBatchProcessor;
  private sql: postgres.Sql;
  private mainLoopPromise: Promise<void> | undefined;
  private deprecationLogged = false;

  constructor(
    batchProcessor: IBatchProcessor,
    lifecycle: ILifecycle,
    sql: postgres.Sql,
    logger: Logger
  ) {
    this.sql = sql;
    this.lifecycle = lifecycle;
    this.batchProcessor = batchProcessor;
    this.logger = logger;
  }

  startOnlyOnce(workerBootstrap: WorkerBootstrap) {
    if (!this.lifecycle.isCreated) {
      this.logger.debug('Worker not in Created state, ignoring start request');
      return;
    }
    this.mainLoopPromise = this.start(workerBootstrap);
  }

  private async start(workerBootstrap: WorkerBootstrap) {
    try {
      await this.lifecycle.acknowledgeStart(workerBootstrap);

      while (this.isMainLoopActive) {
        try {
          await this.lifecycle.sendHeartbeat();
        } catch (error: unknown) {
          this.logger.error(`Error sending heartbeat: ${error}`);
          // Continue execution - a failed heartbeat shouldn't stop processing
        }

        // Check if deprecated after heartbeat
        if (!this.isMainLoopActive) {
          this.logDeprecation();
          break;
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
      // Signal deprecation (which includes "Stopped accepting new messages")
      this.logDeprecation();
      this.abortController.abort();

      try {
        this.logger.debug('-> Waiting for main loop to complete');
        await this.mainLoopPromise;
      } catch (error) {
        this.logger.error(
          `Error in main loop: ${error}. Continuing to stop worker`
        );
        throw error;
      }

      // Signal waiting for pending tasks
      this.logger.shutdown('waiting');
      await this.batchProcessor.awaitCompletion();

      this.lifecycle.acknowledgeStop();

      this.logger.debug('-> Closing SQL connection...');
      await this.sql.end();

      // Signal graceful stop complete
      this.logger.shutdown('stopped');
    } catch (error) {
      this.logger.debug(`Error during worker stop: ${error}`);
      throw error;
    }
  }

  get edgeFunctionName() {
    return this.lifecycle.edgeFunctionName;
  }

  /**
   * Log deprecation message only once (prevents duplicate logs when deprecation
   * is detected in heartbeat and then stop() is called)
   */
  private logDeprecation(): void {
    if (!this.deprecationLogged) {
      this.logger.shutdown('deprecating');
      this.deprecationLogged = true;
    }
  }

  /**
   * Returns true if worker state is Running and worker was not stopped
   */
  private get isMainLoopActive() {
    return this.lifecycle.isRunning && !this.isAborted;
  }

  private get isAborted() {
    return this.abortController.signal.aborted;
  }
}
