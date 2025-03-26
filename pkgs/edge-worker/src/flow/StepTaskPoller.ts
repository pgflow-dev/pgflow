import type { StepTaskRecord, IPgflowClient } from './types.ts';
import type { IPoller, Json } from '../core/types.ts';
import { getLogger } from '../core/Logger.ts';

export interface StepTaskPollerConfig {
  batchSize: number;
  queueName: string;
}

/**
 * A poller that retrieves flow tasks using an IPgflowClient
 */
export class StepTaskPoller<TPayload extends Json = Json> implements IPoller<StepTaskRecord<TPayload>> {
  private logger = getLogger('StepTaskPoller');

  constructor(
    private readonly adapter: IPgflowClient<TPayload>,
    private readonly signal: AbortSignal,
    private readonly config: StepTaskPollerConfig
  ) {}

  async poll(): Promise<StepTaskRecord<TPayload>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    this.logger.debug(`Polling for flow tasks with batch size ${this.config.batchSize}`);
    const tasks = await this.adapter.pollForTasks(this.config.queueName);
    this.logger.debug(`Retrieved ${tasks.length} flow tasks`);

    return tasks;
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}
