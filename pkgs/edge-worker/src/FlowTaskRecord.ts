import type { Json } from './types.ts';

/**
 * Represents a task record returned from pgflow.poll_for_tasks
 */
export interface FlowTaskRecord<TPayload extends Json = Json> {
  flow_slug: string;         // The slug of the flow
  run_id: string;            // The run ID for this flow execution
  step_slug: string;         // Which step in the flow this task is for
  input: TPayload;           // Data needed for this step
  msg_id: number;            // Message ID for the task
}
