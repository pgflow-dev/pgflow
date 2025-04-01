import type { StepTaskRecord, IPgflowClient } from './types.ts';
import type { IPoller } from '../core/types.ts';
import { getLogger } from '../core/Logger.ts';
import type { Flow } from '../../../dsl/src/dsl.ts';

export interface StepTaskPollerConfig {
  batchSize: number;
  queueName: string;
}

/**
 * A poller that retrieves flow tasks using an IPgflowClient
 */
export class StepTaskPoller<TFlow extends Flow<any, any, any>>
  implements IPoller<StepTaskRecord<TFlow>>
{
  private logger = getLogger('StepTaskPoller');

  constructor(
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    private readonly config: StepTaskPollerConfig
  ) {}

  async poll(): Promise<StepTaskRecord<TFlow>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    this.logger.debug(
      `Polling for flow tasks with batch size ${this.config.batchSize}`
    );

    try {
      const tasks = await this.adapter.pollForTasks(
        this.config.queueName,
        this.config.batchSize
      );
      this.logger.debug(`Retrieved ${tasks.length} flow tasks`);
      return tasks;
    } catch (err: unknown) {
      this.logger.error(`Error polling for flow tasks: ${err}`);
      return [];
    }
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}
