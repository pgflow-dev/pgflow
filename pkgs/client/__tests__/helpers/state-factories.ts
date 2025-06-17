import type { RunRow, StepStateRow, Json } from '@pgflow/core';
import { FlowRun } from '../../src/lib/FlowRun';
import { FlowStep } from '../../src/lib/FlowStep';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types';

/**
 * Factory functions for creating state objects used in tests
 */

export function createRunRow(overrides: Partial<RunRow> = {}): RunRow {
  return {
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    flow_slug: 'test-flow',
    status: 'started',
    input: { foo: 'bar' } as Json,
    output: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    failed_at: null,
    remaining_steps: 2,
    ...overrides,
  };
}

export function createStepStateRow(overrides: Partial<StepStateRow> = {}): StepStateRow {
  return {
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    step_slug: 'test-step',
    status: 'created',
    started_at: null,
    completed_at: null,
    failed_at: null,
    error_message: null,
    created_at: new Date().toISOString(),
    flow_slug: 'test-flow',
    remaining_deps: 0,
    remaining_tasks: 1,
    ...overrides,
  };
}

export function createFlowRun(overrides: Partial<Parameters<typeof FlowRun['constructor']>[0]> = {}): FlowRun {
  return new FlowRun({
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    flow_slug: 'test-flow',
    status: FlowRunStatus.Started,
    input: { foo: 'bar' } as any,
    output: null,
    error: null,
    error_message: null,
    started_at: new Date(),
    completed_at: null,
    failed_at: null,
    remaining_steps: 0,
    ...overrides,
  });
}

export function createFlowStep(overrides: Partial<Parameters<typeof FlowStep['constructor']>[0]> = {}): FlowStep {
  return new FlowStep({
    run_id: '123e4567-e89b-12d3-a456-426614174000',
    step_slug: 'test-step' as any,
    status: FlowStepStatus.Created,
    output: null,
    error: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    failed_at: null,
    ...overrides,
  });
}

/**
 * Creates a run in a specific state with appropriate timestamps and fields
 */
export function createRunInState(
  status: 'started' | 'completed' | 'failed',
  overrides: Partial<RunRow> = {}
): RunRow {
  const baseRun = createRunRow(overrides);
  
  switch (status) {
    case 'started':
      return {
        ...baseRun,
        status: 'started',
        started_at: new Date().toISOString(),
      };
      
    case 'completed':
      return {
        ...baseRun,
        status: 'completed',
        started_at: new Date(Date.now() - 60000).toISOString(),
        completed_at: new Date().toISOString(),
        output: { result: 'success' } as Json,
        remaining_steps: 0,
      };
      
    case 'failed':
      return {
        ...baseRun,
        status: 'failed',
        started_at: new Date(Date.now() - 60000).toISOString(),
        failed_at: new Date().toISOString(),
      };
  }
}

/**
 * Creates a step in a specific state with appropriate timestamps and fields
 */
export function createStepInState(
  status: 'created' | 'started' | 'completed' | 'failed',
  overrides: Partial<StepStateRow> = {}
): StepStateRow {
  const baseStep = createStepStateRow(overrides);
  
  switch (status) {
    case 'created':
      return baseStep;
      
    case 'started':
      return {
        ...baseStep,
        status: 'started',
        started_at: new Date().toISOString(),
      };
      
    case 'completed':
      return {
        ...baseStep,
        status: 'completed',
        started_at: new Date(Date.now() - 30000).toISOString(),
        completed_at: new Date().toISOString(),
      };
      
    case 'failed':
      return {
        ...baseStep,
        status: 'failed',
        started_at: new Date(Date.now() - 30000).toISOString(),
        failed_at: new Date().toISOString(),
        error_message: 'Step failed',
      };
  }
}

/**
 * Creates a complete flow run state with multiple steps
 */
export function createCompleteFlowState(options: {
  runId?: string;
  flowSlug?: string;
  runStatus?: 'started' | 'completed' | 'failed';
  steps?: Array<{
    stepSlug: string;
    status: 'created' | 'started' | 'completed' | 'failed';
  }>;
} = {}): { run: RunRow; steps: StepStateRow[] } {
  const {
    runId = '123e4567-e89b-12d3-a456-426614174000',
    flowSlug = 'test-flow',
    runStatus = 'started',
    steps = [
      { stepSlug: 'step-1', status: 'created' },
      { stepSlug: 'step-2', status: 'created' },
    ],
  } = options;
  
  const run = createRunInState(runStatus, {
    run_id: runId,
    flow_slug: flowSlug,
    remaining_steps: steps.filter(s => s.status !== 'completed').length,
  });
  
  const stepStates = steps.map(({ stepSlug, status }) =>
    createStepInState(status, {
      run_id: runId,
      flow_slug: flowSlug,
      step_slug: stepSlug,
    })
  );
  
  return { run, steps: stepStates };
}