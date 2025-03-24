import type postgres from 'postgres';
import { getLogger } from '../Logger.ts';
import type {
  FlowAdapter,
  PollForTasksArgs,
  PollForTasksResult,
  CompleteTaskArgs,
  CompleteTaskResult,
  FailTaskArgs,
  FailTaskResult,
  StartFlowArgs,
  StartFlowResult
} from './types.ts';

/**
 * SQL implementation of the FlowAdapter interface
 */
export class SqlFlowAdapter implements FlowAdapter {
  private logger = getLogger('SqlFlowAdapter');

  constructor(private readonly sql: postgres.Sql) {}

  /**
   * Poll for available tasks
   */
  async pollForTasks(args: PollForTasksArgs): Promise<PollForTasksResult> {
    this.logger.debug(`Polling for tasks from queue ${args.queue_name}`);

    return await this.sql<PollForTasksResult>`
      SELECT * FROM pgflow.poll_for_tasks(
        queue_name => ${args.queue_name},
        vt => ${args.vt},
        qty => ${args.qty},
        max_poll_seconds => ${args.max_poll_seconds || 5},
        poll_interval_ms => ${args.poll_interval_ms || 200}
      );
    `;
  }

  /**
   * Complete a task with its output
   */
  async completeTask(args: CompleteTaskArgs): Promise<CompleteTaskResult> {
    this.logger.debug(`Completing task for run ${args.run_id}, step ${args.step_slug}`);

    return await this.sql<CompleteTaskResult>`
      SELECT * FROM pgflow.complete_task(
        run_id => ${args.run_id},
        step_slug => ${args.step_slug},
        task_index => ${args.task_index},
        output => ${args.output}
      );
    `;
  }

  /**
   * Fail a task with an error message
   */
  async failTask(args: FailTaskArgs): Promise<FailTaskResult> {
    this.logger.debug(`Failing task for run ${args.run_id}, step ${args.step_slug}: ${args.error_message}`);

    return await this.sql<FailTaskResult>`
      SELECT * FROM pgflow.fail_task(
        run_id => ${args.run_id},
        step_slug => ${args.step_slug},
        task_index => ${args.task_index},
        error_message => ${args.error_message}
      );
    `;
  }

  /**
   * Start a new flow run
   */
  async startFlow(args: StartFlowArgs): Promise<StartFlowResult> {
    this.logger.debug(`Starting flow ${args.flow_slug}`);

    return await this.sql<StartFlowResult>`
      SELECT * FROM pgflow.start_flow(
        flow_slug => ${args.flow_slug},
        input => ${args.input}
      );
    `;
  }
}
