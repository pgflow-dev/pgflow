import { Json } from './types.ts';

/**
 * Represents a task record returned from pgflow.poll_for_tasks
 */
export interface FlowTaskRecord<TPayload extends Json = Json> {
  id: string;                // The primary key for the flow task
  step_slug: string;         // Which step in the flow this task is for
  input_data: TPayload;      // Data needed for this step
  msg_id: number;            // To satisfy IMessage interface
  // Additional fields from pgflow may be added as needed
}