import type { WorkerBootstrap } from './types.ts';
import { getLogger, setupLogger } from './Logger.ts';
import type { Poller } from './interfaces/Poller.ts';
import type { PayloadExecutor } from './interfaces/PayloadExecutor.ts';
import type { WorkerLifecycle } from './interfaces/WorkerLifecycle.ts';

/**
 * Core Worker class that processes tasks from a queue
 * 
 * This class is now backend-agnostic and can work with any implementation
 * of Poller, PayloadExecutor, and WorkerLifecycle.
 */
export class Worker<TPayload> {
  private logger = getLogger('Worker');

  constructor(
    private readonly poller: Poller<TPayload>,
    private readonly executor: PayloadExecutor<TPayload>,
    private readonly lifecycle: WorkerLifecycle,
    private readonly abortController: AbortController
  ) {}

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
          // Poll for new payloads
          const payloads = await this.poller.poll();
          
          if (this.abortSignal.aborted) {
            this.logger.info('Discarding payloads because worker is stopping');
            continue;
          }

          this.logger.debug(`Starting ${payloads.length} tasks`);
          
          // Process each payload concurrently
          const executionPromises = payloads.map(payload => 
            this.executor.execute(payload)
          );
          
          await Promise.all(executionPromises);
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

      // Note: We no longer have direct access to executionController
      // Wait a bit for in-flight tasks to complete
      this.logger.info('-> Waiting for pending tasks to complete...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.logger.info('-> Pending tasks completed!');

      this.lifecycle.acknowledgeStop();
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

/**
 * Configuration options for Worker
 */
export type WorkerConfig = {
  sql: any; // postgres.Sql
  queueName?: string;
  maxPgConnections?: number;
  maxConcurrent?: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
  retryDelay?: number;
  retryLimit?: number;
  visibilityTimeout?: number;
};