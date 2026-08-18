import type { IBatchProcessor, ILifecycle, WorkerBootstrap } from './types.js';
import type { Logger } from '../platform/types.js';

/** Initial delay before retrying a failed main-loop iteration. */
const RETRY_DELAY_MS = 100;
/** Maximum delay for consecutive failed main-loop iterations. */
const MAX_RETRY_DELAY_MS = 5_000;

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
    let consecutiveFailures = 0;

    try {
      while (this.isMainLoopActive) {
        let iterationFailed = false;

        try {
          await this.lifecycle.sendHeartbeat();
        } catch (error: unknown) {
          this.logger.error(`Error sending heartbeat: ${error}`);
          iterationFailed = true;
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
          iterationFailed = true;
        }

        if (iterationFailed) {
          consecutiveFailures++;
          if (this.isMainLoopActive) {
            await this.waitForRetry(
              Math.min(RETRY_DELAY_MS * 2 ** (consecutiveFailures - 1), MAX_RETRY_DELAY_MS)
            );
          }
        } else {
          // Only a fully successful iteration resets the backoff.
          consecutiveFailures = 0;
        }
      }
    } catch (error) {
      this.logger.error(`Error in worker main loop: ${error}`);
      throw error;
    }
  }

  /**
   * Abort-aware backoff wait: resolves after `ms`, or immediately when the
   * worker's abort signal fires so stop() never waits out a retry delay.
   */
  private waitForRetry(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.isAborted) {
        resolve();
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.abortController.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      this.abortController.signal.addEventListener('abort', onAbort, { once: true });
    });
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
