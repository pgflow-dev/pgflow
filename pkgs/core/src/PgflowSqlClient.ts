import type postgres from 'postgres';
import type {
  IPgflowClient,
  StepTaskKey,
  RunRow,
  MessageRecord,
  ClaimTasksResult,
  MessageId,
} from './types.js';
import type { Json } from './types.js';
import type { AnyFlow, ExtractFlowInput } from '@pgflow/dsl';

/**
 * Implementation of IPgflowClient that uses direct SQL calls to pgflow functions
 */
export class PgflowSqlClient<TFlow extends AnyFlow>
  implements IPgflowClient<TFlow>
{
  constructor(private readonly sql: postgres.Sql) {}

  async readMessages(
    queueName: string,
    visibilityTimeout: number,
    batchSize: number,
    maxPollSeconds = 5,
    pollIntervalMs = 200
  ): Promise<MessageRecord[]> {
    // msg_id is projected to text so PGMQ bigint IDs cross the JavaScript
    // boundary without precision loss (#650)
    return await this.sql<MessageRecord[]>`
      SELECT msg_id::text as msg_id, read_ct, enqueued_at, vt, message, headers
      FROM pgmq.read_with_poll(
        queue_name => ${queueName},
        vt => ${visibilityTimeout},
        qty => ${batchSize},
        max_poll_seconds => ${maxPollSeconds},
        poll_interval_ms => ${pollIntervalMs}
      );
    `;
  }

  async startTasks(
    queueName: string,
    flowSlug: string,
    messageIds: MessageId[],
    workerId: string
  ): Promise<ClaimTasksResult<TFlow>> {
    const [row] = await this.sql<{ result: ClaimTasksResult<TFlow> }[]>`
      select pgflow.claim_tasks(
        queue_name => ${queueName},
        flow_slug => ${flowSlug},
        message_ids => ${messageIds}::bigint[],
        worker_id => ${workerId}::uuid
      ) as result
    `;
    return row.result;
  }

  async completeTask(stepTask: StepTaskKey, output?: Json): Promise<void> {
    await this.sql`
      SELECT pgflow.complete_task(
        run_id => ${stepTask.run_id}::uuid,
        step_slug => ${stepTask.step_slug}::text,
        task_index => ${stepTask.task_index}::int,
        output => ${this.sql.json(output || null)}::jsonb
      );
    `;
  }

  async failTask(stepTask: StepTaskKey, error: unknown): Promise<void> {
    const errorString =
      typeof error === 'string'
        ? error
        : error instanceof Error
        ? error.message
        : JSON.stringify(error);

    await this.sql`
      SELECT pgflow.fail_task(
        run_id => ${stepTask.run_id}::uuid,
        step_slug => ${stepTask.step_slug}::text,
        task_index => ${stepTask.task_index}::int,
        error_message => ${errorString}::text
      );
    `;
  }

  async startFlow<TFlow extends AnyFlow>(
    flow_slug: string,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow> {
    const results = await this.sql<RunRow[]>`
      SELECT * FROM pgflow.start_flow(
        flow_slug => ${flow_slug}::text,
        input => ${this.sql.json(input)}::jsonb
        ${run_id ? this.sql`, run_id => ${run_id}::uuid` : this.sql``}
      );
    `;

    if (results.length === 0) {
      throw new Error(`Failed to start flow ${flow_slug}`);
    }

    const [flowRun] = results;

    return flowRun;
  }
}
