import { vi } from 'vitest';
import { FlowRunStatus, FlowStepStatus } from '../src/lib/types';
import type { 
  RunRow, 
  StepStateRow, 
  StepRow, 
  FlowRow 
} from '@pgflow/core';
import type {
  BroadcastRunEvent,
  BroadcastStepEvent,
  BroadcastRunStartedEvent,
  BroadcastRunCompletedEvent,
  BroadcastRunFailedEvent,
  BroadcastStepStartedEvent,
  BroadcastStepCompletedEvent,
  BroadcastStepFailedEvent,
  FlowRunEvent,
  StepEvent,
} from '../src/lib/types';
import type { AnyFlow } from '@pgflow/dsl';

// Test data constants
export const RUN_ID = '123e4567-e89b-12d3-a456-426614174000';
export const FLOW_SLUG = 'test-flow';
export const STEP_SLUG = 'test-step';
export const ANOTHER_STEP_SLUG = 'another-step';

// ===== DATABASE SNAPSHOTS =====

/**
 * Complete run with multiple steps in started state
 */
export const startedRunSnapshot: RunRow = {
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: 'started',
  input: { foo: 'bar' },
  output: null,
  started_at: new Date().toISOString(),
  completed_at: null,
  failed_at: null,
  remaining_steps: 2,
};

/**
 * Completed run snapshot with output
 */
export const completedRunSnapshot: RunRow = {
  ...startedRunSnapshot,
  status: 'completed',
  output: { result: 'success' },
  completed_at: new Date().toISOString(),
  remaining_steps: 0,
};

/**
 * Failed run snapshot with error message
 */
export const failedRunSnapshot: RunRow = {
  ...startedRunSnapshot,
  status: 'failed',
  failed_at: new Date().toISOString(),
  remaining_steps: 1, // One step was never completed
};

/**
 * Extended step states collection for tests requiring multiple steps
 */
export const stepStatesSample: StepStateRow[] = [
  {
    run_id: RUN_ID,
    step_slug: STEP_SLUG,
    status: 'started',
    created_at: new Date().toISOString(),
    flow_slug: FLOW_SLUG,
    remaining_deps: 0,
    remaining_tasks: 1,
    started_at: new Date().toISOString(),
    completed_at: null,
    failed_at: null,
    error_message: null,
  },
  {
    run_id: RUN_ID,
    step_slug: ANOTHER_STEP_SLUG,
    status: 'created',
    created_at: new Date().toISOString(),
    flow_slug: FLOW_SLUG,
    remaining_deps: 1,
    remaining_tasks: 0,
    started_at: null,
    completed_at: null,
    failed_at: null,
    error_message: null,
  }
];

/**
 * Started step state sample
 */
export const startedStepState: StepStateRow = {
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: 'started',
  created_at: new Date().toISOString(),
  flow_slug: FLOW_SLUG,
  remaining_deps: 0,
  remaining_tasks: 1,
  started_at: new Date().toISOString(),
  completed_at: null,
  failed_at: null,
  error_message: null,
};

/**
 * Completed step state sample
 */
export const completedStepState: StepStateRow = {
  ...startedStepState,
  status: 'completed',
  completed_at: new Date().toISOString(),
};

/**
 * Failed step state sample
 */
export const failedStepState: StepStateRow = {
  ...startedStepState,
  status: 'failed',
  failed_at: new Date().toISOString(),
  error_message: 'Step failed',
};

/**
 * Sample flow definition
 */
export const sampleFlowDefinition: FlowRow = {
  flow_slug: FLOW_SLUG,
  opt_base_delay: 1000,
  opt_max_attempts: 3,
  opt_timeout: 30000,
  created_at: new Date().toISOString(),
};

/**
 * Sample steps definition
 */
export const sampleStepsDefinition: StepRow[] = [
  {
    flow_slug: FLOW_SLUG,
    step_slug: STEP_SLUG,
    step_index: 0,
    step_type: 'task',
    deps_count: 0,
    opt_base_delay: null,
    opt_max_attempts: null,
    opt_timeout: null,
    created_at: new Date().toISOString(),
  },
  {
    flow_slug: FLOW_SLUG,
    step_slug: ANOTHER_STEP_SLUG,
    step_index: 1,
    step_type: 'task',
    deps_count: 1,
    opt_base_delay: null,
    opt_max_attempts: null,
    opt_timeout: null,
    created_at: new Date().toISOString(),
  }
];

// ===== BROADCAST EVENTS =====

/**
 * Run started broadcast event
 */
export const broadcastRunStarted: BroadcastRunStartedEvent = {
  event_type: 'run:started',
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: FlowRunStatus.Started,
  input: { foo: 'bar' },
  started_at: new Date().toISOString(),
  remaining_steps: 2,
};

/**
 * Run completed broadcast event
 */
export const broadcastRunCompleted: BroadcastRunCompletedEvent = {
  event_type: 'run:completed',
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: FlowRunStatus.Completed,
  output: { result: 'success' },
  completed_at: new Date().toISOString(),
};

/**
 * Run failed broadcast event
 */
export const broadcastRunFailed: BroadcastRunFailedEvent = {
  event_type: 'run:failed',
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: FlowRunStatus.Failed,
  error_message: 'Something went wrong',
  failed_at: new Date().toISOString(),
};

/**
 * Step started broadcast event
 */
export const broadcastStepStarted: BroadcastStepStartedEvent = {
  event_type: 'step:started',
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: FlowStepStatus.Started,
  started_at: new Date().toISOString(),
  remaining_tasks: 1,
  remaining_deps: 0,
};

/**
 * Step completed broadcast event
 */
export const broadcastStepCompleted: BroadcastStepCompletedEvent = {
  event_type: 'step:completed',
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: FlowStepStatus.Completed,
  output: { step_result: 'success' },
  completed_at: new Date().toISOString(),
};

/**
 * Step failed broadcast event
 */
export const broadcastStepFailed: BroadcastStepFailedEvent = {
  event_type: 'step:failed',
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: FlowStepStatus.Failed,
  error_message: 'Step failed',
  failed_at: new Date().toISOString(),
};

/**
 * Collection of all events in sequence for a happy path
 */
export const happyPathEventSequence = [
  broadcastRunStarted,
  broadcastStepStarted,
  broadcastStepCompleted,
  {
    ...broadcastStepStarted,
    step_slug: ANOTHER_STEP_SLUG,
  } as BroadcastStepStartedEvent,
  {
    ...broadcastStepCompleted,
    step_slug: ANOTHER_STEP_SLUG,
  } as BroadcastStepCompletedEvent,
  broadcastRunCompleted,
];

/**
 * Collection of events for a failure path
 */
export const failurePathEventSequence = [
  broadcastRunStarted,
  broadcastStepStarted,
  broadcastStepFailed,
  broadcastRunFailed,
];

// ===== CONVERSION UTILITIES =====

/**
 * Convert broadcast events to flow events for testing FlowRun
 */
export function toFlowRunEvent(broadcast: BroadcastRunEvent): FlowRunEvent<AnyFlow> {
  switch (broadcast.event_type) {
    case 'run:started':
      return {
        run_id: broadcast.run_id,
        flow_slug: broadcast.flow_slug,
        input: broadcast.input,
        status: broadcast.status,
        started_at: broadcast.started_at,
        remaining_steps: broadcast.remaining_steps,
      };
    case 'run:completed':
      return {
        run_id: broadcast.run_id,
        flow_slug: broadcast.flow_slug,
        output: broadcast.output,
        status: broadcast.status,
        completed_at: broadcast.completed_at,
      };
    case 'run:failed':
      return {
        run_id: broadcast.run_id,
        flow_slug: broadcast.flow_slug,
        error_message: broadcast.error_message,
        status: broadcast.status,
        failed_at: broadcast.failed_at,
      };
  }
}

export function toStepEvent<TStepSlug extends string>(
  broadcast: BroadcastStepEvent
): StepEvent<AnyFlow, TStepSlug> {
  switch (broadcast.event_type) {
    case 'step:started':
      return {
        run_id: broadcast.run_id,
        step_slug: broadcast.step_slug as TStepSlug,
        status: broadcast.status,
        started_at: broadcast.started_at,
      };
    case 'step:completed':
      return {
        run_id: broadcast.run_id,
        step_slug: broadcast.step_slug as TStepSlug,
        output: broadcast.output,
        status: broadcast.status,
        completed_at: broadcast.completed_at,
      };
    case 'step:failed':
      return {
        run_id: broadcast.run_id,
        step_slug: broadcast.step_slug as TStepSlug,
        error_message: broadcast.error_message,
        status: broadcast.status,
        failed_at: broadcast.failed_at,
      };
  }
}

// ===== TEST UTILITIES =====

/**
 * Helper function to emit events & advance timers, ensuring all microtasks are processed
 * 
 * @param ms - Milliseconds to advance
 * @returns Promise that resolves when all microtasks are processed
 */
export async function advanceAndFlush(ms: number): Promise<void> {
  // First advance by the specified time
  vi.advanceTimersByTime(ms);
  
  // Run any pending timers
  vi.runAllTimers();
  
  // Flush all microtasks (Promises, etc.)
  vi.runAllTicks();
  
  // Return a resolved promise to ensure async context is properly handled
  return Promise.resolve();
}

/**
 * Helper to emit broadcast events to a channel directly
 * 
 * @param channelMock - Channel mock to emit on
 * @param eventType - Type of event to emit
 * @param payload - Event payload
 */
export function emit(
  channelMock: any, 
  eventType: string, 
  payload: any
): void {
  const handler = channelMock.handlers.get('*');
  if (handler) {
    handler({ event: eventType, payload });
  }
}

/**
 * Create a complete run snapshot with steps for a given status
 * 
 * @param status - Run status
 * @param stepStatuses - Map of step slug to status
 * @returns Object with run and steps state
 */
export function createRunSnapshot(
  status: 'started' | 'completed' | 'failed', 
  stepStatuses: Record<string, 'created' | 'started' | 'completed' | 'failed'> = {}
): { run: RunRow; steps: StepStateRow[] } {
  // Base run based on status
  let run: RunRow;
  switch (status) {
    case 'started':
      run = { ...startedRunSnapshot };
      break;
    case 'completed':
      run = { ...completedRunSnapshot };
      break;
    case 'failed':
      run = { ...failedRunSnapshot };
      break;
  }

  // Create step states based on provided map
  const steps: StepStateRow[] = Object.entries(stepStatuses).map(([slug, status]) => {
    const baseStep = {
      run_id: RUN_ID,
      step_slug: slug,
      status,
      started_at: null,
      completed_at: null,
      failed_at: null,
      error_message: null,
    };

    switch (status) {
      case 'started':
        return {
          ...baseStep,
          started_at: new Date().toISOString(),
        };
      case 'completed':
        return {
          ...baseStep,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          output: { step_result: `${slug} completed` },
        };
      case 'failed':
        return {
          ...baseStep,
          started_at: new Date().toISOString(),
          failed_at: new Date().toISOString(),
          error_message: `${slug} failed`,
        };
      default:
        return baseStep;
    }
  });

  return { run, steps };
}

/**
 * Create a function that, when called, will emit all events in a sequence with specified delay between them
 * 
 * @param channelMock - Channel mock to emit events on
 * @param events - Array of events to emit in sequence
 * @param delayMs - Milliseconds of delay between events
 * @returns Function that starts the emission sequence
 */
export function createEventSequenceEmitter(
  channelMock: any,
  events: (BroadcastRunEvent | BroadcastStepEvent)[],
  delayMs = 100
): () => void {
  return () => {
    let timeoutId: NodeJS.Timeout;
    
    // Set up delayed emissions
    events.forEach((event, index) => {
      timeoutId = setTimeout(() => {
        const eventType = event.event_type;
        emit(channelMock, eventType, event);
      }, index * delayMs);
    });
  };
}