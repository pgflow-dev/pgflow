import { getLogger } from '../Logger.ts';
import type { Poller } from '../interfaces/Poller.ts';
import type { FlowAdapter, WorkerTask } from './types.ts';

export interface FlowPollerConfig {
  /**
   * Queue name to poll from
   */
  queueName: string;

  /**
   * Maximum number of tasks to poll at once
   */
  maxConcurrent: number;

  /**
   * Maximum time in seconds to wait for new tasks
   */
  maxPollSeconds: number;

  /**
   * Interval in milliseconds between polling attempts
   */
  pollIntervalMs: number;

  /**
   * Time in seconds that a task is hidden from other consumers
   */
  visibilityTimeout: number;
}

/**
 * Implementation of Poller for pgflow
 */
export class FlowPoller implements Poller<WorkerTask> {
  private logger = getLogger('FlowPoller');

  constructor(
    private readonly adapter: FlowAdapter,
    private readonly signal: AbortSignal,
    private readonly config: FlowPollerConfig
  ) {}

  /**
   * Poll for available tasks
   */
  async poll(): Promise<WorkerTask[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted');
      return [];
    }

    this.logger.debug(`Polling for tasks from queue ${this.config.queueName}...`);

    try {
      const tasks = await this.adapter.pollForTasks({
        queue_name: this.config.queueName,
        vt: this.config.visibilityTimeout,
        qty: this.config.maxConcurrent,
        max_poll_seconds: this.config.maxPollSeconds,
        poll_interval_ms: this.config.pollIntervalMs
      });

      this.logger.debug(`Polled ${tasks.length} tasks`);
      return tasks;
    } catch (error) {
      this.logger.error(`Error polling for tasks: ${error}`);
      return [];
    }
  }

  /**
   * Check if the poller has been aborted
   */
  private isAborted(): boolean {
    return this.signal.aborted;
  }
}
