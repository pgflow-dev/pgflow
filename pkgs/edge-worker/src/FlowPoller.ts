import type postgres from 'postgres';
import { getLogger } from './Logger.ts';
import type { IPoller } from './types.ts';
import type { FlowTaskRecord } from './FlowTaskRecord.ts';
import type { Json } from './types.ts';

export interface FlowPollerConfig {
  batchSize: number;
  maxPollSeconds?: number;
  pollIntervalMs?: number;
}

/**
 * A poller that fetches flow tasks from pgflow.poll_for_tasks
 */
export class FlowPoller<TPayload extends Json> implements IPoller<FlowTaskRecord<TPayload>> {
  private logger = getLogger('FlowPoller');

  constructor(
    private readonly sql: postgres.Sql,
    private readonly signal: AbortSignal,
    private readonly config: FlowPollerConfig,
    private readonly flowSlug: string
  ) {}

  async poll(): Promise<FlowTaskRecord<TPayload>[]> {
    if (this.isAborted()) {
      return [];
    }

    this.logger.debug(`Polling for flow tasks from flow '${this.flowSlug}'...`);
    
    try {
      // Call pgflow.poll_for_tasks to get available tasks
      const records = await this.sql<FlowTaskRecord<TPayload>[]>`
        SELECT *, id::text as msg_id FROM pgflow.poll_for_tasks(
          _flow_slug => ${this.flowSlug},
          _limit => ${this.config.batchSize}
        );
      `;

      // Add msg_id property to satisfy IMessage interface if not already present
      return records.map(record => ({
        ...record,
        msg_id: typeof record.msg_id === 'number' ? record.msg_id : Number(record.id)
      }));
    } catch (error) {
      this.logger.error(`Error polling for flow tasks: ${error}`);
      return [];
    }
  }

  private isAborted(): boolean {
    return this.signal.aborted;
  }
}