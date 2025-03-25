import type { FlowTaskRecord, IPgflowAdapter, Json } from './types-flow.ts';
import type { IPoller } from './types.ts';
import { getLogger } from './Logger.ts';

export interface FlowPollerConfig {
  batchSize: number;
}

/**
 * A poller that retrieves flow tasks using an IPgflowAdapter
 */
export class FlowPoller<TPayload extends Json = Json> implements IPoller<FlowTaskRecord<TPayload>> {
  private logger = getLogger('FlowPoller');

  constructor(
    private readonly adapter: IPgflowAdapter<TPayload>,
    private readonly signal: AbortSignal,
    private readonly config: FlowPollerConfig
  ) {}

  async poll(): Promise<FlowTaskRecord<TPayload>[]> {
    if (this.isAborted()) {
      this.logger.debug('Polling aborted, returning empty array');
      return [];
    }

    this.logger.debug(`Polling for flow tasks with batch size ${this.config.batchSize}`);
    const tasks = await this.adapter.pollForTasks(this.config.batchSize);
    this.logger.debug(`Retrieved ${tasks.length} flow tasks`);
    
    return tasks;
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}