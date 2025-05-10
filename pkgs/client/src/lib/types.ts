import type { AnyFlow, ExtractFlowInput, ExtractFlowOutput, ExtractFlowSteps, StepOutput } from '@pgflow/dsl';
import type { IFlowStarter, Json, RunRow, StepStateRow, FlowRow, StepRow } from '@pgflow/core';

/**
 * Flow run event types
 */
export type FlowRunEvents<TFlow> = {
  started: {
    run_id: string;
    flow_slug: string;
    input: ExtractFlowInput<TFlow>;
    status: 'started';
    started_at: string;
    remaining_steps: number;
  };
  completed: {
    run_id: string;
    output: ExtractFlowOutput<TFlow>;
    status: 'completed';
    completed_at: string;
  };
  failed: { 
    run_id: string; 
    error_message: string; 
    status: 'failed';
    failed_at: string;
  };
  // General event type that includes all events
  '*': { run_id: string; status: string; [key: string]: unknown };
};

/**
 * Step event types
 */
export type StepEvents<
  TFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> = {
  started: { 
    run_id: string; 
    step_slug: TStepSlug; 
    status: 'started';
    started_at: string;
  };
  completed: {
    run_id: string;
    step_slug: TStepSlug;
    output: StepOutput<TFlow, TStepSlug>;
    status: 'completed';
    completed_at: string;
  };
  failed: {
    run_id: string;
    step_slug: TStepSlug;
    error_message: string;
    status: 'failed';
    failed_at: string;
  };
  // General event type that includes all events
  '*': {
    run_id: string;
    step_slug: TStepSlug;
    status: string;
    [key: string]: unknown;
  };
};

/**
 * Function returned by event subscriptions to remove the listener
 */
export type Unsubscribe = () => void;

/**
 * Broadcast run event types for Supabase realtime
 */
export type BroadcastRunStartedEvent = {
  event_type: 'run:started';
  run_id: string;
  flow_slug: string;
  status: 'started';
  input: Json;
  started_at: string;
  remaining_steps: number;
};

export type BroadcastRunCompletedEvent = {
  event_type: 'run:completed';
  run_id: string;
  flow_slug: string;
  status: 'completed';
  output: Json;
  completed_at: string;
};

export type BroadcastRunFailedEvent = {
  event_type: 'run:failed';
  run_id: string;
  flow_slug: string;
  status: 'failed';
  error_message: string;
  failed_at: string;
};

export type BroadcastRunEvent = 
  | BroadcastRunStartedEvent
  | BroadcastRunCompletedEvent
  | BroadcastRunFailedEvent;

/**
 * Broadcast step event types for Supabase realtime
 */
export type BroadcastStepStartedEvent = {
  event_type: 'step:started';
  run_id: string;
  step_slug: string;
  status: 'started';
  started_at: string;
  remaining_tasks: number;
  remaining_deps: number;
};

export type BroadcastStepCompletedEvent = {
  event_type: 'step:completed';
  run_id: string;
  step_slug: string;
  status: 'completed';
  output: Json;
  completed_at: string;
};

export type BroadcastStepFailedEvent = {
  event_type: 'step:failed';
  run_id: string;
  step_slug: string;
  status: 'failed';
  error_message: string;
  failed_at: string;
};

export type BroadcastStepEvent = 
  | BroadcastStepStartedEvent
  | BroadcastStepCompletedEvent
  | BroadcastStepFailedEvent;

/**
 * Flow run state
 */
export type FlowRunState<TFlow> = {
  run_id: string;
  flow_slug: string;
  status: 'queued' | 'started' | 'completed' | 'failed';
  input: ExtractFlowInput<TFlow>;
  output: ExtractFlowOutput<TFlow> | null;
  error: Error | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
  remaining_steps: number;
};

/**
 * Flow step state
 */
export type FlowStepState<TFlow, TStepSlug extends keyof ExtractFlowSteps<TFlow> & string> = {
  run_id: string;
  step_slug: TStepSlug;
  status: 'created' | 'started' | 'completed' | 'failed';
  output: StepOutput<TFlow, TStepSlug> | null;
  error: Error | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  failed_at: Date | null;
};

/**
 * Interface for realtime updates (used by client library)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface IFlowRealtime<TFlow = unknown> {
  /**
   * Fetch flow definition metadata (looks up flows and steps tables)
   */
  fetchFlowDefinition(flow_slug: string): Promise<{
    flow: FlowRow;
    steps: StepRow[];
  }>;

  /**
   * Register a callback for run events
   * @returns Function to unsubscribe from the event
   */
  onRunEvent(callback: (event: BroadcastRunEvent) => void): Unsubscribe;

  /**
   * Register a callback for step events
   * @returns Function to unsubscribe from the event
   */
  onStepEvent(callback: (event: BroadcastStepEvent) => void): Unsubscribe;

  /**
   * Subscribe to a flow run's events
   */
  subscribeToRun(run_id: string): () => void;

  /**
   * Fetch current state of a run and its steps
   */
  getRunWithStates(run_id: string): Promise<{ run: RunRow; steps: StepStateRow[] }>;
}

/**
 * Composite interface for client
 */
export interface IFlowClient<TFlow extends AnyFlow = AnyFlow>
  extends IFlowStarter,
    IFlowRealtime<TFlow> {}