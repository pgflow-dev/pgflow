import type {
  ExtractFlowSteps,
  StepInput,
  Simplify,
  AnyFlow,
  ExtractFlowInput,
  Json,
} from '@pgflow/dsl';
import type { Database } from './database-types.js';

export type { Json };

/**
 * Record representing a task from pgflow.start_tasks
 *
 * Same as pgflow.step_task_record type, but with not-null fields and type argument for payload.
 * The input type is automatically inferred based on the step_slug using a discriminated union.
 * This ensures that each step only receives inputs from its declared dependencies and the flow's run input.
 *
 * Note: flow_input is nullable because start_tasks only includes it for root non-map steps.
 * For dependent and map steps, flow_input is NULL to avoid data duplication.
 * Workers can access the original flow input via ctx.flowInput (lazy loaded).
 */
export type StepTaskRecord<TFlow extends AnyFlow> = {
  [StepSlug in Extract<keyof ExtractFlowSteps<TFlow>, string>]: {
    flow_slug: string;
    run_id: string;
    step_slug: StepSlug;
    task_index: number;
    input: Simplify<StepInput<TFlow, StepSlug>>;
    msg_id: number;
    flow_input: ExtractFlowInput<TFlow> | null;
  };
}[Extract<keyof ExtractFlowSteps<TFlow>, string>];

/**
 * Composite key that is enough to find a particular step task
 * Contains only the minimum fields needed to identify a task
 */
export type StepTaskKey = Pick<StepTaskRecord<AnyFlow>, 'run_id' | 'step_slug' | 'task_index'>;



/**
 * Record representing a message from queue polling
 */
export type MessageRecord = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: Json;
};

/**
 * Interface for interacting with pgflow database functions
 */
export interface IPgflowClient<TFlow extends AnyFlow = AnyFlow> {
  /**
   * Start a flow with optional run_id
   */
  startFlow<TFlow extends AnyFlow>(
    flow_slug: string,
    input: ExtractFlowInput<TFlow>,
    run_id?: string
  ): Promise<RunRow>;

  /**
   * Reads messages from queue without starting tasks (phase 1 of two-phase approach)
   * @param queueName - Name of the queue
   * @param visibilityTimeout - Visibility timeout for messages
   * @param batchSize - Number of messages to fetch
   * @param maxPollSeconds - Maximum time to poll for messages
   * @param pollIntervalMs - Poll interval in milliseconds
   */
  readMessages(
    queueName: string,
    visibilityTimeout: number,
    batchSize: number,
    maxPollSeconds?: number,
    pollIntervalMs?: number
  ): Promise<MessageRecord[]>;

  /**
   * Starts tasks for given message IDs (phase 2 of two-phase approach)
   * @param flowSlug - The flow slug to start tasks from
   * @param msgIds - Array of message IDs from readMessages
   * @param workerId - ID of the worker starting the tasks
   */
  startTasks(
    flowSlug: string,
    msgIds: number[],
    workerId: string
  ): Promise<StepTaskRecord<TFlow>[]>;

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
