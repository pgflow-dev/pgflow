import type { AnyFlow } from '@pgflow/dsl';
import type { IPgflowClient } from './types.js';
import type { IExecutor } from '../core/types.js';
import type { Logger, TaskLogContext } from '../platform/types.js';
import type { StepTaskHandlerContext } from '../core/context.js';

class AbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

/**
 * Configuration for worker identity in logging
 */
export interface WorkerIdentity {
  workerId: string;
  workerName: string;
  queueName: string;
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
    private readonly context: TContext,
    private readonly workerIdentity: WorkerIdentity
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

  /**
   * Build TaskLogContext for structured logging
   */
  private buildLogContext(): TaskLogContext {
    // Note: read_ct includes the initial read (1-indexed), so read_ct=1 is the first attempt,
    // read_ct=2 is the first retry, etc.
    const retryAttempt = this.rawMessage.read_ct;
    const stepDef = this.flow.getStepDefinition(this.stepTask.step_slug);
    // maxAttempts includes the initial attempt, so maxRetries = maxAttempts - 1
    const maxRetries = stepDef?.options?.maxAttempts ? stepDef.options.maxAttempts - 1 : undefined;
    // baseDelay from step options for retry delay calculation
    const baseDelay = stepDef?.options?.baseDelay;

    return {
      flowSlug: this.stepTask.flow_slug,
      stepSlug: this.stepTask.step_slug,
      // Convert to string for logging (msg_id is number from PostgreSQL bigint)
      msgId: String(this.stepTask.msg_id),
      runId: this.stepTask.run_id,
      workerId: this.workerIdentity.workerId,
      workerName: this.workerIdentity.workerName,
      queueName: this.workerIdentity.queueName,
      retryAttempt,
      maxRetries,
      baseDelay,
    };
  }

  async execute(): Promise<void> {
    const logContext = this.buildLogContext();

    try {
      if (this.signal.aborted) {
        throw new AbortError();
      }

      // Check if already aborted before starting
      this.signal.throwIfAborted();

      const stepSlug = this.stepTask.step_slug;

      // Log task started at debug level
      this.logger.taskStarted(logContext);

      // Get the step handler from the flow with proper typing
      const stepDef = this.flow.getStepDefinition(stepSlug);

      if (!stepDef) {
        throw new Error(`No step definition found for slug=${stepSlug}`);
      }

      // Measure handler execution duration
      const startTime = Date.now();

      // !!! HANDLER EXECUTION !!!
      const result = await stepDef.handler(this.stepTask.input, this.context);
      // !!! HANDLER EXECUTION !!!

      const durationMs = Date.now() - startTime;

      // Log task completed at verbose level
      this.logger.taskCompleted(logContext, durationMs);
      await this.adapter.completeTask(this.stepTask, result);
    } catch (error) {
      await this.handleExecutionError(error, logContext);
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
  private async handleExecutionError(error: unknown, logContext: TaskLogContext) {
    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.debug(`Aborted execution for step task ${this.msgId}`);
      // Do not mark as failed - the worker was aborted and stopping,
      // the task will be picked up by another worker later
    } else {
      // Log task failed at verbose level using structured method
      const errorObj = error instanceof Error ? error : new Error(String(error));
      this.logger.taskFailed(logContext, errorObj);
      await this.adapter.failTask(this.stepTask, error);
    }
  }
}
