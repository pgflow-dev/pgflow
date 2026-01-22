import type { Json } from '@pgflow/core';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types';
import type {
  BroadcastRunStartedEvent,
  BroadcastRunCompletedEvent,
  BroadcastRunFailedEvent,
  BroadcastStepStartedEvent,
  BroadcastStepCompletedEvent,
  BroadcastStepFailedEvent,
  BroadcastStepSkippedEvent,
} from '../../src/lib/types';

/**
 * Factory functions for creating broadcast events with sensible defaults
 */

export function createRunStartedEvent(
  overrides: Partial<BroadcastRunStartedEvent> = {}
): BroadcastRunStartedEvent {
  return {
    event_type: 'run:started',
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    flow_slug: 'test-flow',
    status: FlowRunStatus.Started,
    input: { foo: 'bar' } as Json,
    started_at: new Date().toISOString(),
    remaining_steps: 2,
    ...overrides,
  };
}

export function createRunCompletedEvent(
  overrides: Partial<BroadcastRunCompletedEvent> = {}
): BroadcastRunCompletedEvent {
  return {
    event_type: 'run:completed',
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    flow_slug: 'test-flow',
    status: FlowRunStatus.Completed,
    output: { result: 'success' } as Json,
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createRunFailedEvent(
  overrides: Partial<BroadcastRunFailedEvent> = {}
): BroadcastRunFailedEvent {
  return {
    event_type: 'run:failed',
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    flow_slug: 'test-flow',
    status: FlowRunStatus.Failed,
    error_message: 'Something went wrong',
    failed_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createStepStartedEvent(
  overrides: Partial<BroadcastStepStartedEvent> = {}
): BroadcastStepStartedEvent {
  return {
    event_type: 'step:started',
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    step_slug: 'test-step',
    status: FlowStepStatus.Started,
    started_at: new Date().toISOString(),
    remaining_tasks: 1,
    remaining_deps: 0,
    ...overrides,
  };
}

export function createStepCompletedEvent(
  overrides: Partial<BroadcastStepCompletedEvent> = {}
): BroadcastStepCompletedEvent {
  return {
    event_type: 'step:completed',
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    step_slug: 'test-step',
    status: FlowStepStatus.Completed,
    output: { step_result: 'success' } as Json,
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createStepFailedEvent(
  overrides: Partial<BroadcastStepFailedEvent> = {}
): BroadcastStepFailedEvent {
  return {
    event_type: 'step:failed',
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    step_slug: 'test-step',
    status: FlowStepStatus.Failed,
    error_message: 'Step failed',
    failed_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createStepSkippedEvent(
  overrides: Partial<BroadcastStepSkippedEvent> = {}
): BroadcastStepSkippedEvent {
  return {
    event_type: 'step:skipped',
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    step_slug: 'test-step',
    status: FlowStepStatus.Skipped,
    skipped_at: new Date().toISOString(),
    skip_reason: 'condition_unmet',
    ...overrides,
  };
}
