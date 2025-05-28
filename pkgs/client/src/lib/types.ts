import type { AnyFlow, ExtractFlowInput, ExtractFlowOutput, ExtractFlowSteps, StepOutput } from '@pgflow/dsl';
import type { Json, RunRow, StepStateRow, FlowRow, StepRow } from '@pgflow/core';
import type { FlowRun } from './FlowRun';

/**
 * Flow run status enum
 */
export enum FlowRunStatus {
  Started = 'started',
  Completed = 'completed',
  Failed = 'failed'
}

/**
 * Flow run event data types - individual event shapes
 */
export type FlowRunEventData<TFlow extends AnyFlow> = {
  started: {
    run_id: string;
    flow_slug: string;
    input: ExtractFlowInput<TFlow>;
    status: FlowRunStatus.Started;
    started_at: string;
    remaining_steps: number;
  };
  completed: {
    run_id: string;
    output: ExtractFlowOutput<TFlow>;
    status: FlowRunStatus.Completed;
    completed_at: string;
  };
  failed: { 
    run_id: string; 
    error_message: string; 
    status: FlowRunStatus.Failed;
    failed_at: string;
  };
  // General event type that includes all events with type union
  '*': FlowRunEvent<TFlow>;
};

/**
 * Strong discriminated union for all flow run events
 */
export type FlowRunEvent<TFlow extends AnyFlow> = 
  | FlowRunEventData<TFlow>['started'] 
  | FlowRunEventData<TFlow>['completed']
  | FlowRunEventData<TFlow>['failed'];

/**
 * Type guard to check if an unknown value is a valid FlowRunEvent
 */
export function isFlowRunEvent<TFlow extends AnyFlow>(value: unknown): value is FlowRunEvent<TFlow> {
  return (
    !!value &&
    typeof value === 'object' &&
    'run_id' in value &&
    'flow_slug' in value &&
    !('step_slug' in value) &&
    'status' in value &&
    (
      value.status === FlowRunStatus.Started ||
      value.status === FlowRunStatus.Completed ||
      value.status === FlowRunStatus.Failed
    )
  );
}

/**
 * Type guard for started events
 */
export function isFlowRunStartedEvent<TFlow extends AnyFlow>(
  event: FlowRunEvent<TFlow>
): event is FlowRunEventData<TFlow>['started'] {
  return event.status === FlowRunStatus.Started;
}

/**
 * Type guard for completed events
 */
export function isFlowRunCompletedEvent<TFlow extends AnyFlow>(
  event: FlowRunEvent<TFlow>
): event is FlowRunEventData<TFlow>['completed'] {
  return event.status === FlowRunStatus.Completed;
}

/**
 * Type guard for failed events
 */
export function isFlowRunFailedEvent<TFlow extends AnyFlow>(
  event: FlowRunEvent<TFlow>
): event is FlowRunEventData<TFlow>['failed'] {
  return event.status === FlowRunStatus.Failed;
}

/**
 * Flow run event types matching nanoevents expectations
 */
export type FlowRunEvents<TFlow extends AnyFlow> = {
  [K in keyof FlowRunEventData<TFlow>]: (event: FlowRunEventData<TFlow>[K]) => void;
};

/**
 * Flow step status enum
 */
export enum FlowStepStatus {
  Created = 'created',
  Started = 'started',
  Completed = 'completed',
  Failed = 'failed'
}

/**
 * Step event data types
 */
export type StepEventData<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> = {
  started: { 
    run_id: string; 
    step_slug: TStepSlug; 
    status: FlowStepStatus.Started;
    started_at: string;
  };
  completed: {
    run_id: string;
    step_slug: TStepSlug;
    output: StepOutput<TFlow, TStepSlug>;
    status: FlowStepStatus.Completed;
    completed_at: string;
  };
  failed: {
    run_id: string;
    step_slug: TStepSlug;
    error_message: string;
    status: FlowStepStatus.Failed;
    failed_at: string;
  };
  // General event type that includes the discriminated union
  '*': StepEvent<TFlow, TStepSlug>;
};

/**
 * Strong discriminated union for all step events
 */
export type StepEvent<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> = 
  | StepEventData<TFlow, TStepSlug>['started']
  | StepEventData<TFlow, TStepSlug>['completed']
  | StepEventData<TFlow, TStepSlug>['failed'];

/**
 * Type guard to check if an unknown value is a valid StepEvent
 */
export function isStepEvent<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
>(value: unknown): value is StepEvent<TFlow, TStepSlug> {
  return (
    !!value &&
    typeof value === 'object' &&
    'run_id' in value &&
    'step_slug' in value &&
    'status' in value &&
    (
      value.status === FlowStepStatus.Started ||
      value.status === FlowStepStatus.Completed ||
      value.status === FlowStepStatus.Failed
    )
  );
}

/**
 * Type guard for started step events
 */
export function isStepStartedEvent<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
>(
  event: unknown
): event is StepEventData<TFlow, TStepSlug>['started'] {
  return (
    isStepEvent<TFlow, TStepSlug>(event) &&
    event.status === FlowStepStatus.Started &&
    'event_type' in event &&
    event.event_type === 'step:started'
  );
}

/**
 * Type guard for completed step events
 */
export function isStepCompletedEvent<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
>(
  event: unknown
): event is StepEventData<TFlow, TStepSlug>['completed'] {
  return (
    isStepEvent<TFlow, TStepSlug>(event) &&
    event.status === FlowStepStatus.Completed &&
    'event_type' in event &&
    event.event_type === 'step:completed'
  );
}

/**
 * Type guard for failed step events
 */
export function isStepFailedEvent<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
>(
  event: unknown
): event is StepEventData<TFlow, TStepSlug>['failed'] {
  return (
    isStepEvent<TFlow, TStepSlug>(event) &&
    event.status === FlowStepStatus.Failed &&
    'event_type' in event &&
    event.event_type === 'step:failed'
  );
}

/**
 * Step event types matching nanoevents expectations
 */
export type StepEvents<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string
> = {
  [K in keyof StepEventData<TFlow, TStepSlug>]: 
    (event: StepEventData<TFlow, TStepSlug>[K]) => void;
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
  status: FlowRunStatus.Started;
  input: Json;
  started_at: string;
  remaining_steps: number;
  error_message?: string; // Adding for type compatibility
};

export type BroadcastRunCompletedEvent = {
  event_type: 'run:completed';
  run_id: string;
  flow_slug: string;
  status: FlowRunStatus.Completed;
  output: Json;
  completed_at: string;
  error_message?: string; // Adding for type compatibility
};

export type BroadcastRunFailedEvent = {
  event_type: 'run:failed';
  run_id: string;
  flow_slug: string;
  status: FlowRunStatus.Failed;
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
  status: FlowStepStatus.Started;
  started_at: string;
  remaining_tasks: number;
  remaining_deps: number;
  error_message?: string; // Adding for type compatibility
  output?: Json; // Adding for type compatibility
};

export type BroadcastStepCompletedEvent = {
  event_type: 'step:completed';
  run_id: string;
  step_slug: string;
  status: FlowStepStatus.Completed;
  output: Json;
  completed_at: string;
  error_message?: string; // Adding for type compatibility
};

export type BroadcastStepFailedEvent = {
  event_type: 'step:failed';
  run_id: string;
  step_slug: string;
  status: FlowStepStatus.Failed;
  error_message: string;
  failed_at: string;
  output?: Json; // Adding for type compatibility
};

export type BroadcastStepEvent = 
  | BroadcastStepStartedEvent
  | BroadcastStepCompletedEvent
  | BroadcastStepFailedEvent;

/**
 * Flow run state
 */
export type FlowRunState<TFlow extends AnyFlow> = {
  run_id: string;
  flow_slug: string;
  status: FlowRunStatus;
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
export type FlowStepState<TFlow extends AnyFlow, TStepSlug extends keyof ExtractFlowSteps<TFlow> & string> = {
  run_id: string;
  step_slug: TStepSlug;
  status: FlowStepStatus;
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
  subscribeToRun(run_id: string): Promise<() => void>;

  /**
   * Fetch current state of a run and its steps
   */
  getRunWithStates(run_id: string): Promise<{ run: RunRow; steps: StepStateRow[] }>;
}

/**
 * Generic base interface for flow runs that uses proper event types
 */
export interface FlowRunBase<TEvt = unknown> {
  readonly run_id: string;
  updateState(event: TEvt): boolean;
  step(stepSlug: string): FlowStepBase<unknown>;
  hasStep(stepSlug: string): boolean;
  dispose(): void;
}

/**
 * Generic base interface for flow steps that uses proper event types
 */
export interface FlowStepBase<TEvt = unknown> {
  updateState(event: TEvt): boolean;
}

/**
 * Utility type for broadcast events
 */
export type BroadcastEvent = BroadcastRunEvent | BroadcastStepEvent;

/**
 * Composite interface for client
 */
export interface IFlowClient<TFlow extends AnyFlow = AnyFlow> extends IFlowRealtime<TFlow> {
  /**
   * Start a flow with optional run_id
   * 
   * @param flow_slug - Flow slug to start
   * @param input - Input data for the flow
   * @param run_id - Optional run ID (will be generated if not provided)
   * @returns Promise that resolves with the FlowRun instance
   */
  startFlow<TSpecificFlow extends TFlow>(
    flow_slug: string,
    input: ExtractFlowInput<TSpecificFlow>,
    run_id?: string
  ): Promise<FlowRun<TSpecificFlow>>;
  
  /**
   * Get a flow run by ID
   * 
   * @param run_id - ID of the run to get
   * @returns Promise that resolves with the FlowRun instance or null if not found
   */
  getRun<TSpecificFlow extends TFlow = TFlow>(run_id: string): Promise<FlowRun<TSpecificFlow> | null>;
}