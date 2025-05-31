import type { StepTaskRecord, IPgflowClient } from './types.js';
import type { IPoller } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import type { AnyFlow } from '@pgflow/dsl';

export interface StepTaskPollerConfig {
  batchSize: number;
  queueName: string;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
}

/**
 * A poller that retrieves flow tasks using an IPgflowClient
 */
export class StepTaskPoller<TFlow extends AnyFlow>
  implements IPoller<StepTaskRecord<TFlow>>
{
  private logger: Logger;

  constructor(
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    private readonly config: StepTaskPollerConfig,
    logger: Logger
  ) {
    this.logger = logger;
  }

  async poll(): Promise<StepTaskRecord<TFlow>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    this.logger.debug(
      `Polling for flow tasks with batch size ${this.config.batchSize}, maxPollSeconds: ${this.config.maxPollSeconds}, pollIntervalMs: ${this.config.pollIntervalMs}`
    );

    try {
      // Pass polling configuration to the adapter if they're provided
      const tasks = await this.adapter.pollForTasks(
        this.config.queueName,
        this.config.batchSize,
        this.config.maxPollSeconds,
        this.config.pollIntervalMs
      );
      this.logger.debug(`Retrieved ${tasks.length} flow tasks`);

      // This cast is safe because:
      // 1. The database will only return steps that exist in the flow definition
      // 2. At runtime, step_slug is just a string regardless of TypeScript's type narrowing
      // 3. The real type safety comes from the flow definition system, not this type check
      // 4. Even without the cast, runtime protection would require explicit validation
      return tasks as unknown as StepTaskRecord<TFlow>[];
    } catch (err: unknown) {
      this.logger.error(`Error polling for flow tasks: ${err}`);
      return [];
    }
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}
