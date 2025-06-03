import type {
  AnyFlow,
  ExtractFlowInput,
  ExtractFlowOutput,
  ExtractFlowSteps,
  StepOutput,
} from '@pgflow/dsl';
import type { RunRow, StepStateRow } from '@pgflow/core';
import {
  FlowStepStatus,
  FlowRunStatus,
} from './types.js';
import type {
  BroadcastRunEvent,
  BroadcastStepEvent,
  FlowRunEvent,
  StepEvent,
} from './types.js';

/**
 * Convert a broadcast run event to a typed run event
 */
export function toTypedRunEvent<TFlow extends AnyFlow>(
  evt: BroadcastRunEvent
): FlowRunEvent<TFlow> {
  switch (evt.status) {
    case FlowRunStatus.Started:
      return {
        event_type: 'run:started',
        run_id: evt.run_id,
        flow_slug: evt.flow_slug,
        status: FlowRunStatus.Started,
        started_at: evt.started_at,
        remaining_steps: evt.remaining_steps,
        input: evt.input as ExtractFlowInput<TFlow>,
      };
    case FlowRunStatus.Completed:
      return {
        event_type: 'run:completed',
        run_id: evt.run_id,
        flow_slug: evt.flow_slug,
        status: FlowRunStatus.Completed,
        completed_at: evt.completed_at,
        output: evt.output as ExtractFlowOutput<TFlow>,
      };
    case FlowRunStatus.Failed:
      return {
        event_type: 'run:failed',
        run_id: evt.run_id,
        flow_slug: evt.flow_slug,
        status: FlowRunStatus.Failed,
        failed_at: evt.failed_at,
        error_message: evt.error_message,
      };
  }
}

/**
 * Convert a broadcast step event to a typed step event
 */
export function toTypedStepEvent<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string,
>(evt: BroadcastStepEvent): StepEvent<TFlow, TStepSlug> {
  switch (evt.status) {
    case FlowStepStatus.Started:
      return {
        event_type: 'step:started',
        run_id: evt.run_id,
        step_slug: evt.step_slug as TStepSlug,
        status: FlowStepStatus.Started,
        started_at: evt.started_at,
      };
    case FlowStepStatus.Completed:
      return {
        event_type: 'step:completed',
        run_id: evt.run_id,
        step_slug: evt.step_slug as TStepSlug,
        status: FlowStepStatus.Completed,
        completed_at: evt.completed_at,
        output: evt.output as StepOutput<TFlow, TStepSlug>,
      };
    case FlowStepStatus.Failed:
      return {
        event_type: 'step:failed',
        run_id: evt.run_id,
        step_slug: evt.step_slug as TStepSlug,
        status: FlowStepStatus.Failed,
        failed_at: evt.failed_at,
        error_message: evt.error_message,
      };
  }
}

/**
 * Convert a database run row to a typed run event
 */
export function runRowToTypedEvent<TFlow extends AnyFlow>(
  row: RunRow
): FlowRunEvent<TFlow> {
  switch (row.status) {
    case 'started':
      return {
        event_type: 'run:started',
        run_id: row.run_id,
        flow_slug: row.flow_slug,
        status: FlowRunStatus.Started,
        started_at: row.started_at!,
        remaining_steps: row.remaining_steps,
        input: row.input as ExtractFlowInput<TFlow>,
      };
    case 'completed':
      return {
        event_type: 'run:completed',
        run_id: row.run_id,
        flow_slug: row.flow_slug,
        status: FlowRunStatus.Completed,
        completed_at: row.completed_at!,
        output: row.output as ExtractFlowOutput<TFlow>,
      };
    case 'failed':
      return {
        event_type: 'run:failed',
        run_id: row.run_id,
        flow_slug: row.flow_slug,
        status: FlowRunStatus.Failed,
        failed_at: row.failed_at!,
        error_message: 'Flow failed', // Database doesn't have error_message for runs
      };
    default:
      throw new Error(`Unknown run status: ${row.status}`);
  }
}

/**
 * Convert a database step state row to a typed step event
 */
export function stepStateRowToTypedEvent<
  TFlow extends AnyFlow,
  TStepSlug extends keyof ExtractFlowSteps<TFlow> & string,
>(row: StepStateRow): StepEvent<TFlow, TStepSlug> {
  switch (row.status) {
    case 'created':
    case 'started':
      return {
        event_type: 'step:started',
        run_id: row.run_id,
        step_slug: row.step_slug as TStepSlug,
        status: FlowStepStatus.Started,
        started_at: row.started_at!,
      };
    case 'completed':
      return {
        event_type: 'step:completed',
        run_id: row.run_id,
        step_slug: row.step_slug as TStepSlug,
        status: FlowStepStatus.Completed,
        completed_at: row.completed_at!,
        output: {} as StepOutput<TFlow, TStepSlug>, // Database doesn't have output in step_states
      };
    case 'failed':
      return {
        event_type: 'step:failed',
        run_id: row.run_id,
        step_slug: row.step_slug as TStepSlug,
        status: FlowStepStatus.Failed,
        failed_at: row.failed_at!,
        error_message: row.error_message || 'Step failed',
      };
    default:
      throw new Error(`Unknown step status: ${row.status}`);
  }
}