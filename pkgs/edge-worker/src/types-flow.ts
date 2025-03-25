import type { Json } from './types.ts';

/**
 * Record representing a task from pgflow.poll_for_tasks
 */
export interface FlowTaskRecord<TPayload extends Json = Json> {
  flow_slug: string;
  run_id: string;
  step_slug: string;
  input: TPayload;
  msg_id: number;
}

/**
 * Interface for interacting with pgflow database functions
 */
export interface IPgflowAdapter<TPayload extends Json = Json> {
  /**
   * Fetches tasks from pgflow
   * @param limit - The batch size or number of tasks to retrieve
   * @returns FlowTaskRecord[] - The set of tasks polled from pgflow
   */
  pollForTasks(limit: number): Promise<FlowTaskRecord<TPayload>[]>;

  /**
   * Marks a task as completed
   * @param msgId - Message ID for the task
   * @param output - Result from step handler, or null if none
   */
  completeTask(msgId: number, output?: Json): Promise<void>;

  /**
   * Marks a task as failed
   * @param msgId - Message ID for the task
   * @param error - Error details (string or object) to record
   */
  failTask(msgId: number, error: unknown): Promise<void>;
}
