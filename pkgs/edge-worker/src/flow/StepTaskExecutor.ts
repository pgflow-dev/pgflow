import type { AnyFlow } from '@pgflow/dsl';
import type { StepTaskRecord, IPgflowClient } from './types.js';
import type { IExecutor } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import type { Context } from '../core/context.js';
import type { Sql } from 'postgres';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

/**
 * An executor that processes step tasks using an IPgflowClient
 * with strong typing for the flow's step handlers
 */
export class StepTaskExecutor<TFlow extends AnyFlow> implements IExecutor {
  private logger: Logger;

  constructor(
    private readonly flow: TFlow,
    private readonly task: StepTaskRecord<TFlow>,
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    logger: Logger,
    private readonly sql: Sql,
    private readonly env: Record<string, string | undefined>
  ) {
    this.logger = logger;
  }

  get msgId() {
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
      this.logger.debug(
        `Executing step task ${this.task.msg_id} for step ${stepSlug}`
      );

      // Get the step handler from the flow with proper typing
      const stepDef = this.flow.getStepDefinition(stepSlug);

      if (!stepDef) {
        throw new Error(`No step definition found for slug=${stepSlug}`);
      }

      // !!! HANDLER EXECUTION !!!
      const result = await stepDef.handler(this.task.input);
      // !!! HANDLER EXECUTION !!!

      this.logger.debug(
        `step task ${this.task.msg_id} completed successfully, marking as complete`
      );
      await this.adapter.completeTask(this.task, result);

      this.logger.debug(`step task ${this.task.msg_id} marked as complete`);
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
   * Otherwise, it marks the task as failed.
   */
  private async handleExecutionError(error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.debug(`Aborted execution for step task ${this.task.msg_id}`);
      // Do not mark as failed - the worker was aborted and stopping,
      // the task will be picked up by another worker later
    } else {
      this.logger.error(
        `step task ${this.task.msg_id} failed with error: ${error}`
      );
      await this.adapter.failTask(this.task, error);
    }
  }
}
