import type { Database } from './database-types.ts';

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
 */
export interface StepTaskRecord<TPayload extends Json = Json> {
  flow_slug: string;
  run_id: string;
  step_slug: string;
  input: TPayload;
  msg_id: number;
}

/**
 * Composite key that is enought o find particular step task row
 */
export type StepTaskKey = Pick<StepTaskRow, 'run_id' | 'step_slug'>;


/**
 * Interface for interacting with pgflow database functions
 */
export interface IPgflowClient<TPayload extends Json = Json> {
  /**
   * Fetches tasks from pgflow
   * @param queueName - Name
   * @param batchSize - Number of tasks to fetch
   * @param visibilityTimeout - Visibility timeout for tasks
   * @param maxPollSeconds - Maximum time to poll for tasks
   * @param pollIntervalMs - Poll interval in milliseconds
   */
  pollForTasks(
    queueName: string,
    batchSize?: number,
    visibilityTimeout?: number,
    maxPollSeconds?: number,
    pollIntervalMs?: number
  ): Promise<StepTaskRecord<TPayload>[]>;

  /**
   * Marks a task as completed
   * @param stepTask - Step task key containing run_id and step_slug
   * @param output - Output payload for the task
   */
  completeTask(stepTask: StepTaskKey, output?: Json): Promise<void>;

  /**
   * Marks a task as failed
   * @param stepTask - Step task identifier containing run_id and step_slug
   * @param error - Error to fail task with
   */
  failTask(stepTask: StepTaskKey, error: unknown): Promise<void>;
}

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
