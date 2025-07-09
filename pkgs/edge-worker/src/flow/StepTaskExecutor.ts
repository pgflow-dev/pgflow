import type { AnyFlow } from '@pgflow/dsl';
import type { IPgflowClient } from './types.js';
import type { IExecutor } from '../core/types.js';
import type { Logger } from '../platform/types.js';
import type { StepTaskHandlerContext } from '../core/context.js';

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
export class StepTaskExecutor<TFlow extends AnyFlow, TContext extends StepTaskHandlerContext<TFlow> = StepTaskHandlerContext<TFlow>> implements IExecutor {
  private logger: Logger;

  constructor(
    private readonly flow: TFlow,
    private readonly adapter: IPgflowClient<TFlow>,
    private readonly signal: AbortSignal,
    logger: Logger,
    private readonly context: TContext
  ) {
    this.logger = logger;
  }

  // Convenience getters to avoid drilling into context
  get stepTask() {
    return this.context.stepTask;
  }

  get rawMessage() {
    return this.context.rawMessage;
  }

  get msgId() {
    return this.stepTask.msg_id;
  }

  async execute(): Promise<void> {
    try {
      if (this.signal.aborted) {
        throw new AbortError();
      }

      // Check if already aborted before starting
      this.signal.throwIfAborted();

      const stepSlug = this.stepTask.step_slug;
      this.logger.debug(
        `Executing step task ${this.msgId} for step ${stepSlug}`
      );

      // Get the step handler from the flow with proper typing
      const stepDef = this.flow.getStepDefinition(stepSlug);

      if (!stepDef) {
        throw new Error(`No step definition found for slug=${stepSlug}`);
      }


      // !!! HANDLER EXECUTION !!!
      const result = await stepDef.handler(this.stepTask.input, this.context);
      // !!! HANDLER EXECUTION !!!

      this.logger.debug(
        `step task ${this.msgId} completed successfully, marking as complete`
      );
      await this.adapter.completeTask(this.stepTask, result);

      this.logger.debug(`step task ${this.msgId} marked as complete`);
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
      this.logger.debug(`Aborted execution for step task ${this.msgId}`);
      // Do not mark as failed - the worker was aborted and stopping,
      // the task will be picked up by another worker later
    } else {
      this.logger.error(
        `step task ${this.msgId} failed with error: ${error}`
      );
      await this.adapter.failTask(this.stepTask, error);
    }
  }
}
