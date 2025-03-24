import type { Database } from '../../../core/src/types.d.ts';
import type { Json } from '../types.ts';
import type { Flow } from '../../../dsl/src/dsl.ts';

// Type aliases for pgflow database types
export type FlowRow = Database["pgflow"]["Tables"]["flows"]["Row"];
export type RunRow = Database["pgflow"]["Tables"]["runs"]["Row"];
export type StepRow = Database["pgflow"]["Tables"]["steps"]["Row"];
export type StepStateRow = Database["pgflow"]["Tables"]["step_states"]["Row"];
export type StepTaskRow = Database["pgflow"]["Tables"]["step_tasks"]["Row"];
export type WorkerTask = Database["pgflow"]["CompositeTypes"]["worker_task"];

// Function argument and return types
export type PollForTasksArgs = Database["pgflow"]["Functions"]["poll_for_tasks"]["Args"];
export type PollForTasksResult = WorkerTask[];

export type CompleteTaskArgs = Database["pgflow"]["Functions"]["complete_task"]["Args"];
export type CompleteTaskResult = StepTaskRow[];

export type FailTaskArgs = Database["pgflow"]["Functions"]["fail_task"]["Args"];
export type FailTaskResult = StepTaskRow[];

export type StartFlowArgs = Database["pgflow"]["Functions"]["start_flow"]["Args"];
export type StartFlowResult = RunRow[];

// Flow adapter interface
export interface FlowAdapter {
  /**
   * Poll for available tasks
   */
  pollForTasks(args: PollForTasksArgs): Promise<PollForTasksResult>;

  /**
   * Complete a task with its output
   */
  completeTask(args: CompleteTaskArgs): Promise<CompleteTaskResult>;

  /**
   * Fail a task with an error message
   */
  failTask(args: FailTaskArgs): Promise<FailTaskResult>;

  /**
   * Start a new flow run
   */
  startFlow(args: StartFlowArgs): Promise<StartFlowResult>;
}

// Configuration for FlowWorker
export interface FlowWorkerConfig {
  /**
   * Database connection string
   */
  connectionString?: string;

  /**
   * SQL client instance (if provided, connectionString is ignored)
   */
  sql?: any; // postgres.Sql

  /**
   * Maximum number of PostgreSQL connections
   * @default 10
   */
  maxPgConnections?: number;

  /**
   * Maximum number of concurrent tasks
   * @default 10
   */
  maxConcurrent?: number;

  /**
   * Maximum time in seconds to wait for new tasks
   * @default 5
   */
  maxPollSeconds?: number;

  /**
   * Interval in milliseconds between polling attempts
   * @default 200
   */
  pollIntervalMs?: number;

  /**
   * Time in seconds that a task is hidden from other consumers
   * @default 30
   */
  visibilityTimeout?: number;

  /**
   * Backend configuration
   * @default { type: 'sql' }
   */
  backend?: {
    /**
     * Backend type
     */
    type: 'sql' | 'rpc';

    /**
     * Supabase URL (for RPC backend)
     */
    supabaseUrl?: string;

    /**
     * Supabase key (for RPC backend)
     */
    supabaseKey?: string;
  };
}

// Type for task payload that will be passed to step handlers
export type TaskPayload<RunPayload extends Json> = {
  run: RunPayload;
  [key: string]: Json;
};

// Type for the flow definition with its steps
export type FlowDefinition<RunPayload extends Json> = Flow<RunPayload, Record<string, Json>>;
