import type postgres from 'postgres';
import type { FlowTaskRecord, IPgflowAdapter } from './types-flow.ts';
import type { Json } from './types.ts';
import { getLogger } from './Logger.ts';

/**
 * Implementation of IPgflowAdapter that uses direct SQL calls to pgflow functions
 */
export class PgflowSqlAdapter<TPayload extends Json = Json> implements IPgflowAdapter<TPayload> {
  private logger = getLogger('PgflowSqlAdapter');

  constructor(private readonly sql: postgres.Sql) {}

  async pollForTasks(limit: number): Promise<FlowTaskRecord<TPayload>[]> {
    this.logger.debug(`Polling for up to ${limit} flow tasks`);

    const records = await this.sql<FlowTaskRecord<TPayload>[]>`
      SELECT * FROM pgflow.poll_for_tasks(_limit => ${limit});
    `;

    this.logger.debug(`Retrieved ${records.length} flow tasks`);
    return records;
  }

  async completeTask(msgId: number, output?: Json): Promise<void> {
    this.logger.debug(`Completing flow task ${msgId}`);

    await this.sql`
      SELECT pgflow.complete_task(
        ${msgId},
        ${output ? JSON.stringify(output) : null}::jsonb
      );
    `;

    this.logger.debug(`Completed flow task ${msgId}`);
  }

  async failTask(msgId: number, error: unknown): Promise<void> {
    this.logger.debug(`Failing flow task ${msgId} with error: ${error}`);

    // Convert error to a string
    const errorString = typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error);

    await this.sql`
      SELECT pgflow.fail_task(${msgId}, ${errorString});
    `;

    this.logger.debug(`Failed flow task ${msgId}`);
  }
}
