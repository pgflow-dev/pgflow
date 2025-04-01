import type { Flow } from '../../../dsl/src/dsl.ts';
import type { StepTaskRecord, IPgflowClient } from './types.ts';
import type { Json, IExecutor } from '../core/types.ts';
import { getLogger } from '../core/Logger.ts';

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
export class StepTaskExecutor<
  TRunPayload extends Json,
  TSteps extends Record<string, Json> = Record<never, never>,
  TDependencies extends Record<string, string[]> = Record<string, string[]>
> implements IExecutor
{
  private logger = getLogger('StepTaskExecutor');

  constructor(
    private readonly flow: Flow<TRunPayload, TSteps, TDependencies>,
    private readonly task: StepTaskRecord,
    private readonly adapter: IPgflowClient,
    private readonly signal: AbortSignal
  ) {}

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

      // Execute the step handler with the input data
      // The handler is properly typed based on the Flow definition
      const result = await stepDef.handler(this.task.input);

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
