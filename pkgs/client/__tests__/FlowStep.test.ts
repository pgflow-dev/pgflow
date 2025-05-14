import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowStep } from '../src/lib/FlowStep';
import { FlowStepStatus } from '../src/lib/types';
import { 
  RUN_ID, 
  STEP_SLUG, 
  broadcastStepCompleted, 
  broadcastStepFailed, 
  broadcastStepStarted 
} from './fixtures';
import { resetMocks } from './mocks';

describe('FlowStep', () => {
  // Create a clean step for each test
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  test('initializes with correct state', () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    expect(step.step_slug).toBe(STEP_SLUG);
    expect(step.status).toBe(FlowStepStatus.Created);
    expect(step.output).toBeNull();
    expect(step.error).toBeNull();
    expect(step.error_message).toBeNull();
    expect(step.started_at).toBeNull();
    expect(step.completed_at).toBeNull();
    expect(step.failed_at).toBeNull();
  });

  test('handles started event correctly', () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    const callback = vi.fn();
    step.on('started', callback);

    // Update state with started event
    step.updateState({
      ...broadcastStepStarted,
      step_slug: STEP_SLUG as any,
    });

    expect(step.status).toBe(FlowStepStatus.Started);
    expect(step.started_at).toBeInstanceOf(Date);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('handles completed event correctly', () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Started,
      output: null,
      error: null,
      error_message: null,
      started_at: new Date(),
      completed_at: null,
      failed_at: null,
    });

    const callback = vi.fn();
    step.on('completed', callback);

    // Update state with completed event
    step.updateState({
      ...broadcastStepCompleted,
      step_slug: STEP_SLUG as any,
    });

    expect(step.status).toBe(FlowStepStatus.Completed);
    expect(step.completed_at).toBeInstanceOf(Date);
    expect(step.output).toEqual({ step_result: 'success' });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('handles failed event correctly', () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Started,
      output: null,
      error: null,
      error_message: null,
      started_at: new Date(),
      completed_at: null,
      failed_at: null,
    });

    const callback = vi.fn();
    step.on('failed', callback);

    // Update state with failed event
    step.updateState({
      ...broadcastStepFailed,
      step_slug: STEP_SLUG as any,
    });

    expect(step.status).toBe(FlowStepStatus.Failed);
    expect(step.failed_at).toBeInstanceOf(Date);
    expect(step.error_message).toBe('Step failed');
    expect(step.error).toBeInstanceOf(Error);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('applies status precedence rules', () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    // Created -> Started (allowed)
    step.updateState({
      ...broadcastStepStarted,
      step_slug: STEP_SLUG as any,
    });
    expect(step.status).toBe(FlowStepStatus.Started);

    // Started -> Completed (allowed)
    step.updateState({
      ...broadcastStepCompleted,
      step_slug: STEP_SLUG as any,
    });
    expect(step.status).toBe(FlowStepStatus.Completed);

    // Completed -> Failed (denied - terminal state protection)
    step.updateState({
      ...broadcastStepFailed,
      step_slug: STEP_SLUG as any,
    });
    // Should still be completed, not changed to failed
    expect(step.status).toBe(FlowStepStatus.Completed);
  });

  test('ignores events for different step slugs', () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    const originalStatus = step.status;

    // Send event with a different step slug
    const result = step.updateState({
      ...broadcastStepStarted,
      step_slug: 'different-step' as any,
    });

    expect(result).toBe(false);
    expect(step.status).toBe(originalStatus);
  });

  test('waitForStatus resolves when target status is reached', async () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    // Create a promise that should resolve when the status is updated
    const waitPromise = step.waitForStatus(FlowStepStatus.Completed);
    
    // Update the status after a delay
    setTimeout(() => {
      step.updateState({
        ...broadcastStepCompleted,
        step_slug: STEP_SLUG as any,
      });
    }, 1000);

    // Advance timers to trigger the update
    vi.advanceTimersByTime(1000);
    
    // Wait for the promise to resolve
    const result = await waitPromise;
    expect(result).toBe(step);
    expect(step.status).toBe(FlowStepStatus.Completed);
  });

  test('waitForStatus times out if status is not reached', async () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    // Should timeout after 5000ms (default is 5min, but we'll use a shorter timeout)
    const waitPromise = step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
    
    // Advance timers past the timeout
    vi.advanceTimersByTime(5001);
    
    // The promise should reject
    await expect(waitPromise).rejects.toThrow(/Timeout waiting for step/);
  });

  test('waitForStatus respects abort signal', async () => {
    const step = new FlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
      status: FlowStepStatus.Created,
      output: null,
      error: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    });

    const controller = new AbortController();
    const waitPromise = step.waitForStatus(FlowStepStatus.Completed, { 
      signal: controller.signal 
    });
    
    // Abort the operation
    setTimeout(() => controller.abort(), 1000);
    
    // Advance timers to trigger the abort
    vi.advanceTimersByTime(1000);
    
    // The promise should reject
    await expect(waitPromise).rejects.toThrow(/Aborted waiting for step/);
  });
});