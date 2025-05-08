import type {
  ExtractFlowSteps,
  StepInput,
  Simplify,
  AnyFlow,
  ExtractFlowInput,
} from '@pgflow/dsl';
import type { Database } from './database-types.js';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Record representing a task from pgflow.poll_for_tasks
 *
 * Same as pgflow.step_task_record type, but with not-null fields and type argument for payload.
 * The input type is automatically inferred based on the step_slug using a discriminated union.
 * This ensures that each step only receives inputs from its declared dependencies and the flow's run input.
 */
export type StepTaskRecord<TFlow extends AnyFlow> = {
  [StepSlug in Extract<keyof ExtractFlowSteps<TFlow>, string>]: {
    flow_slug: string;
    run_id: string;
    step_slug: StepSlug;
    input: Simplify<StepInput<TFlow, StepSlug>>;
    msg_id: number;
  };
}[Extract<keyof ExtractFlowSteps<TFlow>, string>];

/**
 * Composite key that is enough to find a particular step task
 * Contains only the minimum fields needed to identify a task
 */
export type StepTaskKey = Pick<StepTaskRecord<any>, 'run_id' | 'step_slug'>;

/**
 * Interface for starting flows
 */
export interface IFlowStarter {
  /**
   * Start a flow with optional run_id
   */
  startFlow<TFlow extends AnyFlow>(
    flow_slug: string,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow>;
}

/**
 * Interface for task processing (used by PgflowSqlClient and edge-worker)
 */
export interface ITaskProcessor {
  /**
   * Poll for available tasks to process
   */
  pollForTasks(
    queueName: string,
    batchSize?: number,
    visibilityTimeout?: number,
    maxPollSeconds?: number,
    pollIntervalMs?: number
  ): Promise<StepTaskRecord<AnyFlow>[]>;

  /**
   * Mark a task as completed with output
   */
  completeTask(stepTask: StepTaskKey, output?: Json): Promise<void>;

  /**
   * Mark a task as failed with error
   */
  failTask(stepTask: StepTaskKey, error: unknown): Promise<void>;
}

/**
 * Composite interface for backward compatibility
 */
export interface IPgflowClient<TFlow extends AnyFlow = AnyFlow>
  extends IFlowStarter,
    ITaskProcessor {}

/**
 * Record representing a flow from pgflow.flows
 */
export type FlowRow = Database['pgflow']['Tables']['flows']['Row'];

/**
 * Record representing a step from pgflow.steps
 */
export type StepRow = Database['pgflow']['Tables']['steps']['Row'];

/**
 * Record representing a step from pgflow.deps
 */
export type DepRow = Database['pgflow']['Tables']['deps']['Row'];

/**
 * Record representing a step from pgflow.queues
 */
export type RunRow = Database['pgflow']['Tables']['runs']['Row'];

/**
 * Record representing a step from pgflow.step_states
 */
export type StepStateRow = Database['pgflow']['Tables']['step_states']['Row'];

/**
 * Record representing a step from pgflow.step_tasks
 */
export type StepTaskRow = Database['pgflow']['Tables']['step_tasks']['Row'];
