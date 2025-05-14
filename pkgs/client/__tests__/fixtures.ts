import { vi } from 'vitest';
import { FlowRunStatus, FlowStepStatus } from '../src/lib/types';
import type { RunRow, StepStateRow } from '@pgflow/core';

// Test data
export const RUN_ID = '123e4567-e89b-12d3-a456-426614174000';
export const FLOW_SLUG = 'test-flow';
export const STEP_SLUG = 'test-step';

// Flow run snapshots for different states
export const startedRunSnapshot: RunRow = {
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: 'started',
  input: { foo: 'bar' },
  output: null,
  error_message: null,
  started_at: new Date().toISOString(),
  completed_at: null,
  failed_at: null,
  remaining_steps: 1,
};

export const completedRunSnapshot: RunRow = {
  ...startedRunSnapshot,
  status: 'completed',
  output: { result: 'success' },
  completed_at: new Date().toISOString(),
  remaining_steps: 0,
};

export const failedRunSnapshot: RunRow = {
  ...startedRunSnapshot,
  status: 'failed',
  error_message: 'Something went wrong',
  failed_at: new Date().toISOString(),
};

// Step state samples for different states
export const startedStepState: StepStateRow = {
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: 'started',
  started_at: new Date().toISOString(),
  completed_at: null,
  failed_at: null,
  error_message: null,
};

export const completedStepState: StepStateRow = {
  ...startedStepState,
  status: 'completed',
  completed_at: new Date().toISOString(),
  output: { step_result: 'success' },
};

export const failedStepState: StepStateRow = {
  ...startedStepState,
  status: 'failed',
  failed_at: new Date().toISOString(),
  error_message: 'Step failed',
};

// Broadcast events
export const broadcastRunStarted = {
  event_type: 'run:started',
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: FlowRunStatus.Started,
  input: { foo: 'bar' },
  started_at: new Date().toISOString(),
  remaining_steps: 1,
};

export const broadcastRunCompleted = {
  event_type: 'run:completed',
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: FlowRunStatus.Completed,
  output: { result: 'success' },
  completed_at: new Date().toISOString(),
};

export const broadcastRunFailed = {
  event_type: 'run:failed',
  run_id: RUN_ID,
  flow_slug: FLOW_SLUG,
  status: FlowRunStatus.Failed,
  error_message: 'Something went wrong',
  failed_at: new Date().toISOString(),
};

export const broadcastStepStarted = {
  event_type: 'step:started',
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: FlowStepStatus.Started,
  started_at: new Date().toISOString(),
  remaining_tasks: 1,
  remaining_deps: 0,
};

export const broadcastStepCompleted = {
  event_type: 'step:completed',
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: FlowStepStatus.Completed,
  output: { step_result: 'success' },
  completed_at: new Date().toISOString(),
};

export const broadcastStepFailed = {
  event_type: 'step:failed',
  run_id: RUN_ID,
  step_slug: STEP_SLUG,
  status: FlowStepStatus.Failed,
  error_message: 'Step failed',
  failed_at: new Date().toISOString(),
};

// Helper function to emit events & advance timers
export function advanceAndFlush(ms: number): void {
  vi.advanceTimersByTime(ms);
  // Flush any pending microtasks
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

// Helper to emit broadcast events
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