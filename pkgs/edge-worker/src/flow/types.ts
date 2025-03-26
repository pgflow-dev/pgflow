import type { Json } from '../core/types.ts';
import type { Database as PgflowDatabase } from '../../../core/src/types.ts';

/**
 * Record representing a task from pgflow.poll_for_tasks
 */
export interface StepTaskRecord<TPayload extends Json = Json> {
  flow_slug: string;
  run_id: string;
  step_slug: string;
  input: TPayload;
  msg_id: number;
}

/**
 * Record representing a flow from pgflow.flows
 */
export type FlowRow = PgflowDatabase['pgflow']['Tables']['flows']['Row'];

/**
 * Record representing a run from pgflow.runs
 */

/**
 * Interface for interacting with pgflow database functions
 */
export interface IPgflowAdapter<TPayload extends Json = Json> {
  /**
   * Fetches tasks from pgflow
   * @param limit - The batch size or number of tasks to retrieve
   * @returns StepTaskRecord[] - The set of tasks polled from pgflow
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
   * @param msgId - Message ID for the task
   * @param output - Result from step handler, or null if none
   */
  completeTask(stepTask: StepTaskRecord<TPayload>, output?: Json): Promise<void>;

  /**
   * Marks a task as failed
   * @param msgId - Message ID for the task
   * @param error - Error details (string or object) to record
   */
  failTask(stepTask: StepTaskRecord<TPayload>, error: unknown): Promise<void>;
}
