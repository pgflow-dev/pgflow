import { getLogger } from '../Logger.ts';
import type { Executor } from '../interfaces/Executor.ts';
import type { FlowAdapter, FlowDefinition, TaskPayload, WorkerTask } from './types.ts';
import type { Json } from '../types.ts';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

/**
 * Implementation of Executor for pgflow
 */
export class FlowExecutor<RunPayload extends Json> implements Executor<WorkerTask> {
  private logger = getLogger('FlowExecutor');
  private currentTask: WorkerTask | null = null;

  constructor(
    private readonly adapter: FlowAdapter,
    private readonly flow: FlowDefinition<RunPayload>,
    private readonly signal: AbortSignal
  ) {}

  /**
   * Get the message ID for logging purposes
   */
  get msgId(): string {
    if (!this.currentTask) return 'unknown';
    return `${this.currentTask.run_id}:${this.currentTask.step_slug}`;
  }

  /**
   * Execute a task
   */
  async execute(task: WorkerTask): Promise<void> {
    if (!task.run_id || !task.step_slug || !task.flow_slug) {
      this.logger.error('Invalid task received, missing required fields');
      return;
    }

    this.currentTask = task;

    try {
      if (this.signal.aborted) {
        throw new AbortError();
      }

      // Check if already aborted before starting
      this.signal.throwIfAborted();

      // Get the step handler from the flow definition
      const steps = this.flow.getSteps();
      const stepSlug = task.step_slug;

      if (!steps[stepSlug]) {
        throw new Error(`Step handler not found for step: ${stepSlug}`);
      }

      const stepHandler = steps[stepSlug].handler;

      this.logger.debug(`Executing task ${this.msgId}...`);

      // Parse the input from the task
      const input = task.input as TaskPayload<RunPayload>;

      // Execute the step handler
      const output = await stepHandler(input);

      this.logger.debug(`Task ${this.msgId} completed successfully, marking as complete...`);

      // Mark the task as complete
      await this.adapter.completeTask({
        run_id: task.run_id,
        step_slug: task.step_slug,
        task_index: 0, // Default to 0 for now
        output: output as Json
      });

      this.logger.debug(`Task ${this.msgId} marked as complete`);
    } catch (error) {
      await this.handleExecutionError(error, task);
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * Handle an error that occurred during execution
   */
  private async handleExecutionError(error: unknown, task: WorkerTask): Promise<void> {
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.debug(`Aborted execution for ${this.msgId}`);
      // Do not throw - the worker was aborted and stopping,
      // the task will reappear after the visibility timeout
      // and be picked up by another worker
      return;
    }

    const errorMessage = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);

    this.logger.error(`Task ${this.msgId} failed with error: ${errorMessage}`);

    if (!task.run_id || !task.step_slug) {
      this.logger.error('Cannot fail task, missing required fields');
      return;
    }

    try {
      await this.adapter.failTask({
        run_id: task.run_id,
        step_slug: task.step_slug,
        task_index: 0, // Default to 0 for now
        error_message: errorMessage
      });

      this.logger.debug(`Task ${this.msgId} marked as failed`);
    } catch (failError) {
      this.logger.error(`Error marking task as failed: ${failError}`);
    }
  }
}
