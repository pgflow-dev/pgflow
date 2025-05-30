import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowRun } from '../src/lib/FlowRun';
import { FlowRunStatus, FlowStepStatus } from '../src/lib/types';
import { toTypedRunEvent, toTypedStepEvent } from '../src/lib/eventAdapters';
import {
  RUN_ID,
  FLOW_SLUG,
  STEP_SLUG,
  ANOTHER_STEP_SLUG,
  broadcastRunStarted,
  broadcastRunCompleted,
  broadcastRunFailed,
  broadcastStepStarted,
  advanceAndFlush,
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
      status: FlowRunStatus.Started,
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
    expect(run.status).toBe(FlowRunStatus.Started);
    expect(run.input).toEqual({ foo: 'bar' });
    expect(run.output).toBeNull();
    expect(run.error).toBeNull();
    expect(run.error_message).toBeNull();
    expect(run.started_at).toBeNull();
    expect(run.completed_at).toBeNull();
    expect(run.failed_at).toBeNull();
    expect(run.remaining_steps).toBe(0);
  });

  describe('event → state mapping', () => {
    test('ignores started event when already started', () => {
      // Runs are created with 'started' status by default in the database
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
        remaining_steps: 2,
      });

      const allCallback = vi.fn();
      const startedCallback = vi.fn();
      run.on('*', allCallback);
      run.on('started', startedCallback);

      // Update state with started event (should be ignored due to same status)
      const result = run.updateState(toTypedRunEvent(broadcastRunStarted));

      // Check update was rejected
      expect(result).toBe(false);

      // Check state remains unchanged
      expect(run.status).toBe(FlowRunStatus.Started);
      expect(run.remaining_steps).toBe(2);

      // Check no callbacks were called
      expect(startedCallback).toHaveBeenCalledTimes(0);
      expect(allCallback).toHaveBeenCalledTimes(0);
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

      const allCallback = vi.fn();
      const completedCallback = vi.fn();
      run.on('*', allCallback);
      run.on('completed', completedCallback);

      // Update state with completed event
      run.updateState(toTypedRunEvent(broadcastRunCompleted));

      // Check state was updated correctly
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(run.completed_at).toBeInstanceOf(Date);
      expect(run.output).toEqual({ result: 'success' });
      expect(run.remaining_steps).toBe(0);

      // Check callbacks were called with correct events
      expect(completedCallback).toHaveBeenCalledTimes(1);
      expect(completedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          run_id: RUN_ID,
          status: FlowRunStatus.Completed,
          output: { result: 'success' },
        })
      );
      expect(allCallback).toHaveBeenCalledTimes(1);
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

      const allCallback = vi.fn();
      const failedCallback = vi.fn();
      run.on('*', allCallback);
      run.on('failed', failedCallback);

      // Update state with failed event
      run.updateState(toTypedRunEvent(broadcastRunFailed));

      // Check state was updated correctly
      expect(run.status).toBe(FlowRunStatus.Failed);
      expect(run.failed_at).toBeInstanceOf(Date);
      expect(run.error_message).toBe('Something went wrong');
      expect(run.error).toBeInstanceOf(Error);
      expect(run.error?.message).toBe('Something went wrong');

      // Check callbacks were called with correct events
      expect(failedCallback).toHaveBeenCalledTimes(1);
      expect(failedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          run_id: RUN_ID,
          status: FlowRunStatus.Failed,
          error_message: 'Something went wrong',
        })
      );
      expect(allCallback).toHaveBeenCalledTimes(1);
    });

    test('handles events with missing fields gracefully', () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { foo: 'bar' } as any,
        output: null,
        error: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        failed_at: null,
        remaining_steps: 0,
      });

      // Incomplete failed event without timestamps
      const incompleteEvent = {
        run_id: RUN_ID,
        status: FlowRunStatus.Failed,
        error_message: 'Something went wrong',
      };

      // Should still update the state correctly
      run.updateState(incompleteEvent as any);

      expect(run.status).toBe(FlowRunStatus.Failed);
      expect(run.failed_at).toBeInstanceOf(Date);
      expect(run.error_message).toBe('Something went wrong');
    });
  });

  describe('status precedence & terminal protections', () => {
    test('applies status precedence rules', () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { foo: 'bar' } as any,
        output: null,
        error: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        failed_at: null,
        remaining_steps: 0,
      });

      // Started -> Started (same precedence, should be rejected)
      expect(run.updateState(toTypedRunEvent(broadcastRunStarted))).toBe(false);
      expect(run.status).toBe(FlowRunStatus.Started);

      // Started -> Completed (allowed - higher precedence)
      expect(run.updateState(toTypedRunEvent(broadcastRunCompleted))).toBe(
        true
      );
      expect(run.status).toBe(FlowRunStatus.Completed);

      // Completed -> Failed (denied - terminal state protection)
      expect(run.updateState(toTypedRunEvent(broadcastRunFailed))).toBe(false);
      // State should not change
      expect(run.status).toBe(FlowRunStatus.Completed);
    });

    test('prevents lower precedence status transitions', () => {
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
        remaining_steps: 2,
      });

      // Create another started event (same precedence)
      const startedEvent = {
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { foo: 'bar' },
      };

      // Should not update to same precedence status
      expect(run.updateState(startedEvent as any)).toBe(false);
      expect(run.status).toBe(FlowRunStatus.Started);
    });

    test('protects terminal states from subsequent updates', () => {
      // Create a run in completed state
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Completed,
        input: { foo: 'bar' } as any,
        output: { result: 'success' },
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: new Date(),
        failed_at: null,
        remaining_steps: 0,
      });

      // Try to update to failed state
      const result = run.updateState(toTypedRunEvent(broadcastRunFailed));

      // Should not update terminal state
      expect(result).toBe(false);
      expect(run.status).toBe(FlowRunStatus.Completed);

      // Output should remain unchanged
      expect(run.output).toEqual({ result: 'success' });

      // Error fields should remain null
      expect(run.error).toBeNull();
      expect(run.error_message).toBeNull();
    });

    test('protects terminal states from same-status updates', () => {
      // Create a run in completed state
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Completed,
        input: { foo: 'bar' } as any,
        output: { result: 'success' },
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: new Date(),
        failed_at: null,
        remaining_steps: 0,
      });

      // Create a new completed event with different output
      const newCompletedEvent = {
        ...broadcastRunCompleted,
        output: { result: 'different result' },
      };

      // Try to update with a new completed event
      const result = run.updateState(toTypedRunEvent(newCompletedEvent));

      // Should not update terminal state even with same status
      expect(result).toBe(false);

      // Output should remain unchanged
      expect(run.output).toEqual({ result: 'success' });
    });
  });

  describe('foreign-run events protection', () => {
    test('ignores events for different run IDs', () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
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

      // Mock a callback to ensure it's not called
      const callback = vi.fn();
      run.on('started', callback);

      // Send event with a different run_id
      const result = run.updateState(
        toTypedRunEvent({
          ...broadcastRunStarted,
          run_id: 'different-run-id',
        })
      );

      // Should reject the update and not change state
      expect(result).toBe(false);
      expect(run.status).toBe(originalStatus);
      expect(callback).not.toHaveBeenCalled();
    });

    test('step updateState ignores events for different run IDs', () => {
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
      const step = run.step(STEP_SLUG as any);
      const originalStepStatus = step.status;

      // Directly call step's updateState with different run_id
      const foreignStepEvent = {
        ...broadcastStepStarted,
        run_id: 'different-run-id',
      };

      // Update should be rejected
      const result = step.updateState(
        toTypedStepEvent(foreignStepEvent as any)
      );
      expect(result).toBe(false);

      // Step status should remain unchanged
      expect(step.status).toBe(originalStepStatus);
    });
  });

  describe('waitForStatus', () => {
    test('resolves when target status is reached', async () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
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
        run.updateState(toTypedRunEvent(broadcastRunCompleted));
      }, 1000);

      // Advance timers to trigger the update
      await advanceAndFlush(1000);

      // Wait for the promise to resolve
      const result = await waitPromise;
      expect(result).toBe(run);
      expect(run.status).toBe(FlowRunStatus.Completed);
    });

    test('waitForStatus times out if status is not reached', async () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
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
      const waitPromise = run.waitForStatus(FlowRunStatus.Completed, {
        timeoutMs: 5000,
      });

      // Advance timers past the timeout
      await advanceAndFlush(5001);

      // The promise should reject
      await expect(waitPromise).rejects.toThrow(/Timeout waiting for run/);
    });

    test('resolves immediately if already in target status', async () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Completed,
        input: { foo: 'bar' } as any,
        output: { result: 'success' },
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: new Date(),
        failed_at: null,
        remaining_steps: 0,
      });

      // Should resolve immediately since already in completed status
      const waitPromise = run.waitForStatus(FlowRunStatus.Completed);
      const result = await waitPromise;

      expect(result).toBe(run);
    });

    test('can be aborted with AbortSignal', async () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { foo: 'bar' } as any,
        output: null,
        error: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        failed_at: null,
        remaining_steps: 0,
      });

      // Create an abort controller
      const controller = new AbortController();

      // Create a promise that should be aborted
      const waitPromise = run.waitForStatus(FlowRunStatus.Completed, {
        signal: controller.signal,
      });

      // Abort the operation
      setTimeout(() => {
        controller.abort();
      }, 1000);

      // Advance timers to trigger the abort
      await advanceAndFlush(1000);

      // The promise should reject
      await expect(waitPromise).rejects.toThrow(/Aborted waiting for run/);
    });

    test('resolves if target status is reached before timeout', async () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { foo: 'bar' } as any,
        output: null,
        error: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        failed_at: null,
        remaining_steps: 0,
      });

      // Create a promise that should resolve if status is reached before timeout
      const waitPromise = run.waitForStatus(FlowRunStatus.Completed, {
        timeoutMs: 5000,
      });

      // Update status before timeout
      setTimeout(() => {
        run.updateState(toTypedRunEvent(broadcastRunCompleted));
      }, 1000);

      // Advance timers partway
      await advanceAndFlush(1000);

      // The promise should resolve
      const result = await waitPromise;
      expect(result).toBe(run);
      expect(run.status).toBe(FlowRunStatus.Completed);
    });
  });

  describe('step caching', () => {
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
        remaining_steps: 2,
      });

      // Create two different steps
      const step1 = run.step(STEP_SLUG as any);
      const step2 = run.step(ANOTHER_STEP_SLUG as any);

      // Each should have the correct slug
      expect(step1.step_slug).toBe(STEP_SLUG);
      expect(step2.step_slug).toBe(ANOTHER_STEP_SLUG);

      // Request same steps again - should be the same instances
      const step1Again = run.step(STEP_SLUG as any);
      const step2Again = run.step(ANOTHER_STEP_SLUG as any);

      expect(step1Again).toBe(step1);
      expect(step2Again).toBe(step2);

      // Check hasStep works
      expect(run.hasStep(STEP_SLUG)).toBe(true);
      expect(run.hasStep(ANOTHER_STEP_SLUG)).toBe(true);
      expect(run.hasStep('non-existent-step')).toBe(false);
    });

    test('creates steps with correct initial state', () => {
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
      const step = run.step(STEP_SLUG as any);

      // Should have default Created status
      expect(step.status).toBe(FlowStepStatus.Created);

      // Should have run_id and step_slug set
      expect(step.step_slug).toBe(STEP_SLUG);

      // Should have null fields for timestamps and output
      expect(step.started_at).toBeNull();
      expect(step.completed_at).toBeNull();
      expect(step.failed_at).toBeNull();
      expect(step.output).toBeNull();
      expect(step.error).toBeNull();
      expect(step.error_message).toBeNull();
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
        remaining_steps: 2,
      });

      // Create two steps
      const step1 = run.step(STEP_SLUG as any);
      const step2 = run.step(ANOTHER_STEP_SLUG as any);

      // Update step state
      expect(
        run.updateStepState(
          STEP_SLUG as any,
          toTypedStepEvent({
            ...broadcastStepStarted,
            step_slug: STEP_SLUG as any,
          })
        )
      ).toBe(true);

      // First step should be updated
      expect(step1.status).toBe(FlowStepStatus.Started);

      // Second step should remain in created state
      expect(step2.status).toBe(FlowStepStatus.Created);

      // Update second step
      expect(
        run.updateStepState(
          ANOTHER_STEP_SLUG as any,
          toTypedStepEvent({
            ...broadcastStepStarted,
            step_slug: ANOTHER_STEP_SLUG as any,
          })
        )
      ).toBe(true);

      // Now both steps should be started
      expect(step1.status).toBe(FlowStepStatus.Started);
      expect(step2.status).toBe(FlowStepStatus.Started);
    });
  });

  describe('auto-dispose', () => {
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

      // Create a step so we can check it gets cleaned up
      const step = run.step(STEP_SLUG as any);

      // Spy on the dispose method
      const disposeSpy = vi.spyOn(run, 'dispose');

      // Add and then remove a listener
      const unsubscribe = run.on('*', vi.fn());
      unsubscribe();

      // Update to a terminal state
      run.updateState(toTypedRunEvent(broadcastRunCompleted));

      // Dispose should be called
      expect(disposeSpy).toHaveBeenCalled();
    });

    test('does not auto-dispose when in terminal state with active listeners', () => {
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

      // Add a listener and keep it active
      run.on('*', vi.fn());

      // Update to a terminal state
      run.updateState(toTypedRunEvent(broadcastRunCompleted));

      // Dispose should NOT be called when listeners are active
      expect(disposeSpy).not.toHaveBeenCalled();
    });

    test('does not auto-dispose when in non-terminal state', () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { foo: 'bar' } as any,
        output: null,
        error: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        failed_at: null,
        remaining_steps: 0,
      });

      // Spy on the dispose method
      const disposeSpy = vi.spyOn(run, 'dispose');

      // Add and then remove a listener
      const unsubscribe = run.on('*', vi.fn());
      unsubscribe();

      // Update to a non-terminal state
      run.updateState(toTypedRunEvent(broadcastRunStarted));

      // Dispose should NOT be called for non-terminal state
      expect(disposeSpy).not.toHaveBeenCalled();
    });

    test('dispose cleans up all resources', () => {
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
        remaining_steps: 2,
      });

      // Create some steps
      run.step(STEP_SLUG as any);
      run.step(ANOTHER_STEP_SLUG as any);

      // Add some event listeners
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const unsubscribe1 = run.on('completed', callback1);
      const unsubscribe2 = run.on('failed', callback2);

      // Manually dispose
      run.dispose();

      // Verify event handlers are cleared by trying to trigger events
      run.updateState(toTypedRunEvent(broadcastRunCompleted));

      // Callbacks should not be called after dispose
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();

      // Check steps were cleared by checking hasStep
      expect(run.hasStep(STEP_SLUG)).toBe(false);
      expect(run.hasStep(ANOTHER_STEP_SLUG)).toBe(false);
    });

    test('multiple dispose calls are safe', () => {
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

      // Should not throw errors for multiple dispose calls
      run.dispose();
      run.dispose();
      run.dispose();

      // The run should still be in a valid state
      expect(run.run_id).toBe(RUN_ID);
      expect(run.status).toBe(FlowRunStatus.Started);
    });
  });
});
