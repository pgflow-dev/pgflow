import type postgres from 'postgres';
import { getLogger } from './Logger.ts';
import type { IExecutor } from './types.ts';
import type { FlowTaskRecord } from './FlowTaskRecord.ts';
import type { Json } from './types.ts';
import type { Flow } from '../dsl/src/dsl.ts';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

/**
 * Executes a flow task by calling the appropriate step handler
 * and then marking the task as complete or failed in pgflow.
 */
export class FlowTaskExecutor<TPayload extends Json> implements IExecutor {
  private logger = getLogger('FlowTaskExecutor');

  constructor(
    private readonly flow: Flow<TPayload>,
    private readonly task: FlowTaskRecord<TPayload>,
    private readonly signal: AbortSignal,
    private readonly sql: postgres.Sql
  ) {}

  get msgId(): number {
    return this.task.msg_id;
  }

  async execute(): Promise<void> {
    try {
      if (this.signal.aborted) {
        throw new AbortError();
      }

      // Check if already aborted before starting
      this.signal.throwIfAborted();

      const stepSlug = this.task.step_slug;
      this.logger.debug(`Executing flow task ${this.msgId} for step '${stepSlug}'...`);
      
      // Get the step handler from the flow
      const steps = this.flow.getSteps();
      const stepDef = steps[stepSlug];
      
      if (!stepDef || !stepDef.handler) {
        throw new Error(`No handler found for step '${stepSlug}'`);
      }

      // Execute the step handler with the input data
      const result = await stepDef.handler(this.task.input_data);

      // Mark the task as complete in pgflow
      this.logger.debug(`Task ${this.msgId} completed successfully, marking as complete...`);
      await this.sql`SELECT pgflow.complete_task(${this.task.id}, ${JSON.stringify(result)}::jsonb);`;
      this.logger.debug(`Marked task ${this.msgId} as complete`);
    } catch (error) {
      await this.handleExecutionError(error);
    }
  }

  /**
   * Handles the error that occurred during execution.
   *
   * If the error is an AbortError, it means that the worker was aborted and stopping,
   * the task will be picked up by another worker later.
   *
   * Otherwise, it marks the task as failed in pgflow.
   */
  private async handleExecutionError(error: unknown): Promise<void> {
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.debug(`Aborted execution for ${this.msgId}`);
      // Do not mark as failed - the worker was aborted and stopping,
      // the task will be picked up by another worker later
    } else {
      this.logger.error(`Task ${this.msgId} failed with error: ${error}`);
      
      // Mark the task as failed in pgflow
      try {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.sql`SELECT pgflow.fail_task(${this.task.id}, ${errorMessage});`;
        this.logger.debug(`Marked task ${this.msgId} as failed`);
      } catch (markFailedError) {
        this.logger.error(`Error marking task ${this.msgId} as failed: ${markFailedError}`);
      }
    }
  }
}