import type { Flow } from '../dsl/src/dsl.ts';
import type { FlowTaskRecord, IPgflowAdapter, Json } from './types-flow.ts';
import type { IExecutor } from './types.ts';
import { getLogger } from './Logger.ts';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

/**
 * An executor that processes flow tasks using an IPgflowAdapter
 */
export class FlowTaskExecutor<TPayload extends Json = Json> implements IExecutor {
  private logger = getLogger('FlowTaskExecutor');

  constructor(
    private readonly flow: Flow<TPayload>,
    private readonly task: FlowTaskRecord<TPayload>,
    private readonly adapter: IPgflowAdapter<TPayload>,
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
      this.logger.debug(`Executing flow task ${this.task.msg_id} for step ${stepSlug}`);

      // Get the step handler from the flow
      const steps = this.flow.getSteps();
      const stepDef = steps[stepSlug];

      if (!stepDef) {
        throw new Error(`No step definition found for slug=${stepSlug}`);
      }

      // Execute the step handler with the input data
      const result = await stepDef.handler(this.task.input);

      this.logger.debug(`Flow task ${this.task.msg_id} completed successfully, marking as complete`);
      await this.adapter.completeTask(this.task.msg_id, result);

      this.logger.debug(`Flow task ${this.task.msg_id} marked as complete`);
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
      this.logger.debug(`Aborted execution for flow task ${this.task.msg_id}`);
      // Do not mark as failed - the worker was aborted and stopping,
      // the task will be picked up by another worker later
    } else {
      this.logger.error(`Flow task ${this.task.msg_id} failed with error: ${error}`);
      await this.adapter.failTask(this.task.msg_id, error);
    }
  }
}
