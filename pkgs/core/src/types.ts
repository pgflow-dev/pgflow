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
 * PGMQ message id: a SQL bigint, always delivered to JavaScript as an exact
 * decimal string through explicit SQL text projection (#650).
 */
export type MessageId = string;

/**
 * Diagnostic row returned by claim_tasks for messages that were skipped,
 * archived, or rejected during a claim batch (#650). One row per message;
 * no message bodies ever appear here.
 */
export type ClaimDiagnosticReason =
  | 'foreign_message'
  | 'unsupported_work'
  | 'wrong_route'
  | 'invalid_subscription';

export type ClaimDiagnostic = {
  queue_name: string;
  message_id: MessageId;
  reason: ClaimDiagnosticReason;
};

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
    queue_name: string;
    input: Simplify<StepInput<TFlow, StepSlug>>;
    msg_id: MessageId;
    flow_input: ExtractFlowInput<TFlow> | null;
  };
}[Extract<keyof ExtractFlowSteps<TFlow>, string>];

/**
 * Composite key that is enough to find a particular step task
 * Contains only the minimum fields needed to identify a task
 */
export type StepTaskKey = Pick<StepTaskRecord<AnyFlow>, 'run_id' | 'step_slug' | 'task_index'>;



/**
 * Result of pgflow.claim_tasks (#650): one committed outcome for the whole
 * read batch. `ok` carries the claimed tasks and body-free warnings for
 * archived members; `fatal` carries no tasks and the reasons the batch was
 * rejected - the SQL side already reset visibility and paused the worker.
 */
export type ClaimTasksResult<TFlow extends AnyFlow = AnyFlow> =
  | { status: 'ok'; tasks: StepTaskRecord<TFlow>[]; warnings: ClaimDiagnostic[] }
  | { status: 'fatal'; tasks: []; errors: ClaimDiagnostic[] };

/**
 * Record representing a message from queue polling
 */
export type MessageRecord = {
  msg_id: MessageId;
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
   * Claims tasks for given message IDs via pgflow.claim_tasks (phase 2 of
   * two-phase approach). Returns started tasks plus claim diagnostics; a
   * `fatal` status means the SQL side reset visibility and paused the
   * worker, so the caller must stop (#650).
   * @param queueName - Name of the queue the messages were read from
   * @param flowSlug - The flow slug to claim tasks from
   * @param msgIds - Array of message IDs from readMessages
   * @param workerId - ID of the worker claiming the tasks
   */
  startTasks(
    queueName: string,
    flowSlug: string,
    msgIds: MessageId[],
    workerId: string
  ): Promise<ClaimTasksResult<TFlow>>;

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
 * Record representing a step from pgflow.step_tasks. The generated type
 * labels the PGMQ bigint message ID as `number`; the runtime value arrives
 * as a decimal string through explicit SQL text projection (#650).
 */
export type StepTaskRow = Omit<
  Database['pgflow']['Tables']['step_tasks']['Row'],
  'message_id'
> & { message_id: MessageId | null };
