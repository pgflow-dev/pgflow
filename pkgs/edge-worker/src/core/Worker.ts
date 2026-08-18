import type { IBatchProcessor, ILifecycle, WorkerBootstrap } from './types.js';
import type { Logger } from '../platform/types.js';

export interface WorkerOptions {
  requestShutdown?: () => void;
  cleanup?: () => Promise<void>;
}

export class Worker {
  private lifecycle: ILifecycle;
  private logger: Logger;
  private abortController = new AbortController();
  private readonly requestShutdown?: () => void;
  private readonly cleanup?: () => Promise<void>;

  private batchProcessor: IBatchProcessor;
  private mainLoopPromise: Promise<void> | undefined;
  private startupPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;
  private deprecationLogged = false;
  private deprecationHandler?: () => void;

  constructor(
    batchProcessor: IBatchProcessor,
    lifecycle: ILifecycle,
    logger: Logger,
    options: WorkerOptions = {}
  ) {
    this.lifecycle = lifecycle;
    this.batchProcessor = batchProcessor;
    this.logger = logger;
    this.requestShutdown = options.requestShutdown;
    this.cleanup = options.cleanup;
  }

  startOnlyOnce(workerBootstrap: WorkerBootstrap): Promise<void> {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    if (!this.lifecycle.isCreated) {
      this.logger.debug('Worker not in Created state, ignoring start request');
      return Promise.resolve();
    }

    this.startupPromise = this.lifecycle
      .acknowledgeStart(workerBootstrap)
      .then(() => {
        this.mainLoopPromise = this.runMainLoop();
      })
      .catch((error) => {
        this.logger.error(`Error in worker startup: ${error}`);
        throw error;
      });

    return this.startupPromise;
  }

  private async runMainLoop() {
    try {
      while (this.isMainLoopActive) {
        try {
          await this.lifecycle.sendHeartbeat();
        } catch (error: unknown) {
          this.logger.error(`Error sending heartbeat: ${error}`);
        }

        if (!this.isMainLoopActive) {
          this.logDeprecation();
          if (this.isDeprecated) {
            this.deprecationHandler?.();
          }
          break;
        }

        try {
          await this.batchProcessor.processBatch();
        } catch (error: unknown) {
          this.logger.error(`Error processing batch: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error in worker main loop: ${error}`);
      throw error;
    }
  }

  onDeprecated(handler: () => void): void {
    this.deprecationHandler = handler;
  }

  stop(): Promise<void> {
    this.stopPromise ??= Promise.resolve().then(() => this.performStop());
    return this.stopPromise;
  }

  private async performStop() {
    if (this.lifecycle.isStopping || this.lifecycle.isStopped) {
      return;
    }

    try {
      this.logDeprecation();
      this.requestShutdown?.();
      this.abortController.abort();

      // Wait for startup to settle before transitioning: a stop during
      // Starting must not attempt an invalid transition, and the abort
      // above already keeps the main loop from processing any batch.
      if (this.startupPromise) {
        await this.startupPromise;
      }

      this.lifecycle.transitionToStopping();

      this.logger.debug('-> Waiting for main loop to complete');
      try {
        await this.mainLoopPromise;
      } catch (error) {
        this.logger.error(
          `Error in main loop: ${error}. Continuing to stop worker`
        );
        throw error;
      }

      this.logger.shutdown('waiting');
      await this.batchProcessor.awaitCompletion();

      this.lifecycle.acknowledgeStop();

      if (this.cleanup) {
        this.logger.debug('-> Running worker cleanup...');
        await this.cleanup();
      }

      this.logger.shutdown('stopped');
    } catch (error) {
      this.logger.debug(`Error during worker stop: ${error}`);
      throw error;
    }
  }

  get edgeFunctionName() {
    return this.lifecycle.edgeFunctionName;
  }

  get isCreated() {
    return this.lifecycle.isCreated;
  }

  get isStarting() {
    return this.lifecycle.isStarting ?? false;
  }

  get isRunning() {
    return this.lifecycle.isRunning;
  }

  get isDeprecated() {
    return this.lifecycle.isDeprecated ?? false;
  }

  get isStopped() {
    return this.lifecycle.isStopped;
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
