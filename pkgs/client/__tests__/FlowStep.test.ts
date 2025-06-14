import { describe, test, expect, vi } from 'vitest';
import { FlowStep } from '../src/lib/FlowStep';
import { FlowStepStatus } from '../src/lib/types';
import {
  setupTestEnvironment,
  advanceTimersAndFlush,
  createEventTracker,
} from './helpers/test-utils';
import {
  createStepStartedEvent,
  createStepCompletedEvent,
  createStepFailedEvent,
} from './helpers/event-factories';
import { createFlowStep } from './helpers/state-factories';
// Test scenarios have been inlined for clarity
import { RUN_ID, STEP_SLUG, ANOTHER_STEP_SLUG } from './fixtures';

describe('FlowStep', () => {
  setupTestEnvironment();

  test('initializes with correct state', () => {
    const step = createFlowStep({
      run_id: RUN_ID,
      step_slug: STEP_SLUG as any,
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

  describe('event → state mapping', () => {
    test('handles started event correctly', () => {
      const step = createFlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG as any,
      });

      const startedEvent = createStepStartedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
      });

      // Update state and verify
      const result = step.updateState(startedEvent);
      expect(result).toBe(true);

      // Check state was updated correctly
      expect(step.status).toBe(FlowStepStatus.Started);
      expect(step.started_at).toBeInstanceOf(Date);
    });

    test('handles completed event correctly', () => {
      const step = createFlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG as any,
        status: FlowStepStatus.Started,
        started_at: new Date(),
      });

      const completedEvent = createStepCompletedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        output: { step_result: 'success' },
      });

      // Update state and verify
      const result = step.updateState(completedEvent);
      expect(result).toBe(true);

      // Check state was updated correctly
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.completed_at).toBeInstanceOf(Date);
      expect(step.output).toEqual({ step_result: 'success' });
    });

    test('handles failed event correctly', () => {
      const step = createFlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG as any,
        status: FlowStepStatus.Started,
        started_at: new Date(),
      });

      const failedEvent = createStepFailedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        error_message: 'Step failed',
      });

      // Update state and verify
      const result = step.updateState(failedEvent);
      expect(result).toBe(true);

      // Check state was updated correctly
      expect(step.status).toBe(FlowStepStatus.Failed);
      expect(step.failed_at).toBeInstanceOf(Date);
      expect(step.error_message).toBe('Step failed');
      expect(step.error).toBeInstanceOf(Error);
      expect(step.error?.message).toBe('Step failed');
    });

    test('handles events with missing fields gracefully', () => {
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

      // Incomplete failed event without timestamps
      const incompleteEvent = {
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Failed,
        error_message: 'Something went wrong'
      };
      
      // Should still update the state correctly
      step.updateState(incompleteEvent as any);
      
      expect(step.status).toBe(FlowStepStatus.Failed);
      expect(step.failed_at).toBeInstanceOf(Date);
      expect(step.error_message).toBe('Something went wrong');
    });
  });

  describe('status precedence & terminal protections', () => {
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

      // Lower to higher precedence should succeed
      // Created -> Started (allowed)
      const startedEvent = createStepStartedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
      });
      expect(step.updateState(startedEvent)).toBe(true);
      expect(step.status).toBe(FlowStepStatus.Started);

      // Started -> Completed (allowed - higher precedence)
      const completedEvent = createStepCompletedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        output: { step_result: 'success' },
      });
      expect(step.updateState(completedEvent)).toBe(true);
      expect(step.status).toBe(FlowStepStatus.Completed);

      // Completed -> Failed (denied - terminal state protection)
      const failedEvent = createStepFailedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        error_message: 'Attempt to override completed step',
      });
      expect(step.updateState(failedEvent)).toBe(false);
      // State should not change
      expect(step.status).toBe(FlowStepStatus.Completed);
    });

    test('prevents lower precedence status transitions', () => {
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

      // Create a "created" event (lower precedence than Started)
      const createdEvent = {
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Created,
      };

      // Should not update to lower precedence status
      expect(step.updateState(createdEvent as any)).toBe(false);
      expect(step.status).toBe(FlowStepStatus.Started);
    });

    test('protects terminal states from subsequent updates', () => {
      // Create a step in completed state
      const step = new FlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG as any,
        status: FlowStepStatus.Completed,
        output: { step_result: 'success' },
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: new Date(),
        failed_at: null,
      });

      // Try to update to failed state
      const failedEvent = createStepFailedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        error_message: 'Attempt to override completed step',
      });
      const result = step.updateState(failedEvent);
      
      // Should not update terminal state
      expect(result).toBe(false);
      expect(step.status).toBe(FlowStepStatus.Completed);
      
      // Output should remain unchanged
      expect(step.output).toEqual({ step_result: 'success' });
      
      // Error fields should remain null
      expect(step.error).toBeNull();
      expect(step.error_message).toBeNull();
    });

    test('protects terminal states from same-status updates', () => {
      // Create a step in completed state
      const step = new FlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG as any,
        status: FlowStepStatus.Completed,
        output: { step_result: 'success' },
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: new Date(),
        failed_at: null,
      });

      // Create a new completed event with different output
      const newCompletedEvent = createStepCompletedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        output: { step_result: 'different result' },
      });

      // Try to update with a new completed event
      const result = step.updateState(newCompletedEvent);
      
      // Should not update terminal state even with same status
      expect(result).toBe(false);
      
      // Output should remain unchanged
      expect(step.output).toEqual({ step_result: 'success' });
    });
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

    // Mock a callback to ensure it's not called
    const callback = vi.fn();
    step.on('started', callback);

    // Send event with a different step_slug
    const differentStepEvent = createStepStartedEvent({
      run_id: RUN_ID,
      step_slug: ANOTHER_STEP_SLUG,
    });
    const result = step.updateState(differentStepEvent);

    // Should reject the update and not change state
    expect(result).toBe(false);
    expect(step.status).toBe(originalStatus);
    expect(callback).not.toHaveBeenCalled();
  });

  describe('waitForStatus', () => {
    test('resolves when target status is reached', async () => {
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
        const completedEvent = createStepCompletedEvent({
          run_id: RUN_ID,
          step_slug: STEP_SLUG,
          output: { result: 'success' },
        });
        step.updateState(completedEvent);
      }, 1000);

      // Advance timers to trigger the update
      await advanceTimersAndFlush(1000);
      
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
      await advanceTimersAndFlush(5001);
      
      // The promise should reject
      await expect(waitPromise).rejects.toThrow(/Timeout waiting for step/);
    });

    test('resolves immediately if already in target status', async () => {
      const step = new FlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG as any,
        status: FlowStepStatus.Completed,
        output: { step_result: 'success' },
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: new Date(),
        failed_at: null,
      });

      // Should resolve immediately since already in completed status
      const waitPromise = step.waitForStatus(FlowStepStatus.Completed);
      const result = await waitPromise;
      
      expect(result).toBe(step);
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
      await advanceTimersAndFlush(1000);
      
      // The promise should reject
      await expect(waitPromise).rejects.toThrow(/Aborted waiting for step/);
    });

    test('resolves if target status is reached before timeout', async () => {
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

      // Create a promise that should resolve if status is reached before timeout
      const waitPromise = step.waitForStatus(FlowStepStatus.Completed, { timeoutMs: 5000 });
      
      // Update status before timeout
      setTimeout(() => {
        const completedEvent = createStepCompletedEvent({
          run_id: RUN_ID,
          step_slug: STEP_SLUG,
          output: { result: 'success' },
        });
        step.updateState(completedEvent);
      }, 1000);
      
      // Advance timers partway
      await advanceTimersAndFlush(1000);
      
      // The promise should resolve
      const result = await waitPromise;
      expect(result).toBe(step);
      expect(step.status).toBe(FlowStepStatus.Completed);
    });

    test('waitForStatus works for all status types', async () => {
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

      // Test waiting for started status
      const startedPromise = step.waitForStatus(FlowStepStatus.Started);
      
      // Update to started
      setTimeout(() => {
        const startedEvent = createStepStartedEvent({
          run_id: RUN_ID,
          step_slug: STEP_SLUG,
        });
        step.updateState(startedEvent);
      }, 1000);
      
      await advanceTimersAndFlush(1000);
      
      const startedResult = await startedPromise;
      expect(startedResult.status).toBe(FlowStepStatus.Started);
      
      // Test waiting for failed status
      const failedPromise = step.waitForStatus(FlowStepStatus.Failed);
      
      // Update to failed
      setTimeout(() => {
        const failedEvent = createStepFailedEvent({
          run_id: RUN_ID,
          step_slug: STEP_SLUG,
          error_message: 'Test failure',
        });
        step.updateState(failedEvent);
      }, 1000);
      
      await advanceTimersAndFlush(1000);
      
      const failedResult = await failedPromise;
      expect(failedResult.status).toBe(FlowStepStatus.Failed);
    });
  });
});