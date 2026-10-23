import type { AnyFlow } from '@pgflow/dsl';
import type { Json, StepTaskRecord } from '@pgflow/core';
import type { IPgflowClient } from '@pgflow/core';
import type { IExecutor } from '../core/types.js';
import type { Logger, TaskLogContext } from '../platform/types.js';
import type { StepTaskHandlerContext } from '../core/context.js';

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
  get stepTask(): StepTaskRecord<TFlow> {
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
      // msg_id is an exact decimal string from PostgreSQL bigint (#650)
      msgId: this.stepTask.msg_id,
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
    if (this.signal.aborted) {
      this.logger.debug(`Aborted execution for step task ${this.msgId}`);
      return;
    }

    const logContext = this.buildLogContext();
    // Telemetry before execution is not a handler failure.
    this.logger.taskStarted(logContext);
    const startTime = Date.now();
    let result: Json;

    try {
      // Logging may have triggered shutdown before the handler starts.
      this.signal.throwIfAborted();

      const stepSlug = this.stepTask.step_slug;

      // Get the step handler from the flow with proper typing
      const stepDef = this.flow.getStepDefinition(stepSlug);

      if (!stepDef) {
        throw new Error(`No step definition found for slug=${stepSlug}`);
      }

      // Route input based on step type and dependencies
      let handlerInput: unknown;
      if (stepDef.stepType === 'map') {
        // Map steps: SQL already extracted element
        handlerInput = this.stepTask.input;
      } else if (stepDef.dependencies.length === 0) {
        // Root single/array step: flow_input is guaranteed by SQL (start_tasks)
        handlerInput = this.stepTask.flow_input!;
      } else {
        // Dependent single/array step: use deps object from task input
        handlerInput = this.stepTask.input;
      }

      // !!! HANDLER EXECUTION !!!
      result = await stepDef.handler(handlerInput, this.context);
      // !!! HANDLER EXECUTION !!!
    } catch (error) {
      await this.handleExecutionError(error, logContext);
      return;
    }

    // A successful handler still gets one completion attempt during shutdown.
    // v1 has no claim-replay contract: acknowledgement errors escape to the
    // worker error boundary without retry (the RPC may already have committed).
    // In-memory results cannot be recovered after process death.
    const durationMs = Date.now() - startTime;
    await this.reportResult(
      () => this.logger.taskCompleted(logContext, durationMs),
      () => this.adapter.completeTask(this.stepTask, result)
    );
  }

  /** Report once even if telemetry throws, then surface both errors if needed. */
  private async reportResult(log: () => void, report: () => Promise<void>) {
    const errors: unknown[] = [];
    try {
      log();
    } catch (error) {
      errors.push(error);
    }
    try {
      await report();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Task result logging and reporting failed');
    }
  }

  /**
   * Handles the error that occurred during execution.
   *
   * Only the worker shutdown signal classifies an execution as interrupted.
   * An unrelated AbortError from a handler is still a handler failure.
   */
  private async handleExecutionError(error: unknown, logContext: TaskLogContext) {
    if (this.signal.aborted) {
      this.logger.debug(`Aborted execution for step task ${this.msgId}`);
      // Do not mark as failed - the worker was aborted and stopping,
      // the task will be picked up by another worker later
    } else {
      await this.reportResult(
        () => {
          const errorObj = error instanceof Error ? error : new Error(String(error));
          this.logger.taskFailed(logContext, errorObj);
        },
        () => this.adapter.failTask(this.stepTask, error)
      );
    }
  }
}
