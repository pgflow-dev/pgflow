import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowRun } from '../src/lib/FlowRun';
import { FlowRunStatus } from '../src/lib/types';
import { 
  RUN_ID, 
  FLOW_SLUG, 
  STEP_SLUG,
  broadcastRunStarted, 
  broadcastRunCompleted, 
  broadcastRunFailed,
  broadcastStepStarted
} from './fixtures';
import { resetMocks } from './mocks';

describe('FlowRun', () => {
  // Create a clean run for each test
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  test('initializes with correct state', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Queued,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: 0,
    });

    expect(run.run_id).toBe(RUN_ID);
    expect(run.flow_slug).toBe(FLOW_SLUG);
    expect(run.status).toBe(FlowRunStatus.Queued);
    expect(run.input).toEqual({ foo: 'bar' });
    expect(run.output).toBeNull();
    expect(run.error).toBeNull();
    expect(run.error_message).toBeNull();
    expect(run.started_at).toBeNull();
    expect(run.completed_at).toBeNull();
    expect(run.failed_at).toBeNull();
    expect(run.remaining_steps).toBe(0);
  });

  test('handles started event correctly', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Queued,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: 0,
    });

    const callback = vi.fn();
    run.on('started', callback);

    // Update state with started event
    run.updateState(broadcastRunStarted);

    expect(run.status).toBe(FlowRunStatus.Started);
    expect(run.started_at).toBeInstanceOf(Date);
    expect(run.remaining_steps).toBe(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('handles completed event correctly', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Started,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: new Date(),
      completed_at: null,
      failed_at: null,
      remaining_steps: 1,
    });

    const callback = vi.fn();
    run.on('completed', callback);

    // Update state with completed event
    run.updateState(broadcastRunCompleted);

    expect(run.status).toBe(FlowRunStatus.Completed);
    expect(run.completed_at).toBeInstanceOf(Date);
    expect(run.output).toEqual({ result: 'success' });
    expect(run.remaining_steps).toBe(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('handles failed event correctly', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Started,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: new Date(),
      completed_at: null,
      failed_at: null,
      remaining_steps: 1,
    });

    const callback = vi.fn();
    run.on('failed', callback);

    // Update state with failed event
    run.updateState(broadcastRunFailed);

    expect(run.status).toBe(FlowRunStatus.Failed);
    expect(run.failed_at).toBeInstanceOf(Date);
    expect(run.error_message).toBe('Something went wrong');
    expect(run.error).toBeInstanceOf(Error);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('applies status precedence rules', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Queued,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: 0,
    });

    // Queued -> Started (allowed)
    run.updateState(broadcastRunStarted);
    expect(run.status).toBe(FlowRunStatus.Started);

    // Started -> Completed (allowed)
    run.updateState(broadcastRunCompleted);
    expect(run.status).toBe(FlowRunStatus.Completed);

    // Completed -> Failed (denied - terminal state protection)
    run.updateState(broadcastRunFailed);
    // Should still be completed, not changed to failed
    expect(run.status).toBe(FlowRunStatus.Completed);
  });

  test('ignores events for different run IDs', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Queued,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: 0,
    });

    const originalStatus = run.status;

    // Send event with a different run_id
    const result = run.updateState({
      ...broadcastRunStarted,
      run_id: 'different-run-id',
    });

    expect(result).toBe(false);
    expect(run.status).toBe(originalStatus);
  });

  test('waitForStatus resolves when target status is reached', async () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Queued,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: 0,
    });

    // Create a promise that should resolve when the status is updated
    const waitPromise = run.waitForStatus(FlowRunStatus.Completed);
    
    // Update the status after a delay
    setTimeout(() => {
      run.updateState(broadcastRunCompleted);
    }, 1000);

    // Advance timers to trigger the update
    vi.advanceTimersByTime(1000);
    
    // Wait for the promise to resolve
    const result = await waitPromise;
    expect(result).toBe(run);
    expect(run.status).toBe(FlowRunStatus.Completed);
  });

  test('waitForStatus times out if status is not reached', async () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Queued,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
      remaining_steps: 0,
    });

    // Should timeout after 5000ms
    const waitPromise = run.waitForStatus(FlowRunStatus.Completed, { timeoutMs: 5000 });
    
    // Advance timers past the timeout
    vi.advanceTimersByTime(5001);
    
    // The promise should reject
    await expect(waitPromise).rejects.toThrow(/Timeout waiting for run/);
  });

  test('creates and caches step instances', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Started,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: new Date(),
      completed_at: null,
      failed_at: null,
      remaining_steps: 1,
    });

    // Create a step
    const step1 = run.step(STEP_SLUG as any);
    expect(step1.step_slug).toBe(STEP_SLUG);
    
    // Request the same step again - should be the same instance
    const step2 = run.step(STEP_SLUG as any);
    expect(step2).toBe(step1);
  });

  test('auto-disposes when in terminal state with no listeners', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Started,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: new Date(),
      completed_at: null,
      failed_at: null,
      remaining_steps: 1,
    });

    // Spy on the dispose method
    const disposeSpy = vi.spyOn(run, 'dispose');

    // Add and then remove a listener
    const unsubscribe = run.on('*', vi.fn());
    unsubscribe();

    // Update to a terminal state
    run.updateState(broadcastRunCompleted);
    
    // Dispose should be called
    expect(disposeSpy).toHaveBeenCalled();
  });

  test('updates step state via run', () => {
    const run = new FlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      status: FlowRunStatus.Started,
      input: { foo: 'bar' } as any,
      output: null,
      error: null,
      error_message: null,
      started_at: new Date(),
      completed_at: null,
      failed_at: null,
      remaining_steps: 1,
    });

    // Update step state
    const updateResult = run.updateStepState(STEP_SLUG as any, {
      ...broadcastStepStarted,
      step_slug: STEP_SLUG as any,
    });

    expect(updateResult).toBe(true);
    
    // Check that the step has the correct state
    const step = run.step(STEP_SLUG as any);
    expect(step.status).toBe('started');
  });
});