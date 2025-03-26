import type postgres from 'postgres';
import type { StepTaskRecord, IPgflowAdapter } from './types-flow.ts';
import type { Json } from './types.ts';
import { getLogger } from './Logger.ts';

/**
 * Implementation of IPgflowAdapter that uses direct SQL calls to pgflow functions
 */
export class PgflowSqlAdapter<TPayload extends Json = Json>
  implements IPgflowAdapter<TPayload>
{
  private logger = getLogger('PgflowSqlAdapter');

  constructor(private readonly sql: postgres.Sql) {}

  async pollForTasks(
    queueName: string,
    batchSize = 20,
    visibilityTimeout = 2,
    maxPollSeconds = 5,
    pollIntervalMs = 200
  ): Promise<StepTaskRecord<TPayload>[]> {
    return await this.sql<StepTaskRecord<TPayload>[]>`
      SELECT *
      FROM pgflow.poll_for_tasks(
        queue_name => ${queueName},
        vt => ${visibilityTimeout},
        qty => ${batchSize},
        max_poll_seconds => ${maxPollSeconds},
        poll_interval_ms => ${pollIntervalMs}
      );
    `;
  }

  async completeTask(
    stepTaskRecord: StepTaskRecord<TPayload>,
    output?: Json
  ): Promise<void> {
    this.logger.debug(`Completing flow task ${stepTaskRecord.msg_id}`);

    await this.sql`
      SELECT pgflow.complete_task(
        run_id => ${stepTaskRecord.run_id}::uuid,
        step_slug => ${stepTaskRecord.step_slug}::text,
        task_index => ${0}::int,
        output => ${this.sql.json(output || null)}::jsonb
      );
    `;

    this.logger.debug(`Completed flow task ${stepTaskRecord.msg_id}`);
  }

  async failTask(
    stepTaskRecord: StepTaskRecord<TPayload>,
    error: unknown
  ): Promise<void> {
    this.logger.debug(
      `Failing flow task ${stepTaskRecord.msg_id} with error: ${error}`
    );

    // Convert error to a string
    const errorString =
      typeof error === 'string'
        ? error
        : error instanceof Error
        ? error.message
        : JSON.stringify(error);

    await this.sql`
      SELECT pgflow.fail_task(
        run_id => ${stepTaskRecord.run_id}::uuid,
        step_slug => ${stepTaskRecord.step_slug}::text,
        task_index => ${0}::int,
        error_message => ${errorString}::text
      );
    `;

    this.logger.debug(`Failed flow task ${stepTaskRecord.msg_id}`);
  }
}
