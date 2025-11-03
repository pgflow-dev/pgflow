import { describe, test, expect, vi } from 'vitest';
import { FlowRun } from '../src/lib/FlowRun';
import { FlowStep } from '../src/lib/FlowStep';
import { FlowRunStatus, FlowStepStatus } from '../src/lib/types';
import { toTypedRunEvent, toTypedStepEvent } from '../src/lib/eventAdapters';
import {
  setupTestEnvironment,
  advanceTimersAndFlush,
  createEventTracker,
} from './helpers/test-utils';
import {
  createRunStartedEvent,
  createRunCompletedEvent,
  createRunFailedEvent,
  createStepStartedEvent,
} from './helpers/event-factories';
import { createFlowRun } from './helpers/state-factories';
// Test scenarios have been inlined for clarity
import { RUN_ID, FLOW_SLUG, STEP_SLUG, ANOTHER_STEP_SLUG } from './fixtures';

describe('FlowRun', () => {
  setupTestEnvironment();

  test('initializes with correct state', () => {
    const run = createFlowRun({
      run_id: RUN_ID,
      flow_slug: FLOW_SLUG,
      input: { foo: 'bar' } as any,
    });

    expect(run.run_id).toBe(RUN_ID);
    expect(run.flow_slug).toBe(FLOW_SLUG);
    expect(run.status).toBe(FlowRunStatus.Started);
    expect(run.input).toEqual({ foo: 'bar' });
    expect(run.output).toBeNull();
    expect(run.error).toBeNull();
    expect(run.error_message).toBeNull();
    expect(run.started_at).toBeInstanceOf(Date);
    expect(run.completed_at).toBeNull();
    expect(run.failed_at).toBeNull();
    expect(run.remaining_steps).toBe(0);
  });

  describe('event → state mapping', () => {
    test('ignores started event when already started', () => {
      // Runs are created with 'started' status by default in the database
      const run = createFlowRun({
        run_id: RUN_ID,
        remaining_steps: 2,
      });

      const startedEvent = createRunStartedEvent({ run_id: RUN_ID });

      // Set up event tracking
      const allTracker = createEventTracker();
      const startedTracker = createEventTracker();
      run.on('*', allTracker.callback);
      run.on('started', startedTracker.callback);

      // Attempt to update state (should be rejected due to same status)
      const result = run.updateState(toTypedRunEvent(startedEvent));

      // Verify state update was rejected
      expect(result).toBe(false);

      // Verify no events were emitted using comprehensive matchers
      expect(allTracker).toHaveReceivedTotalEvents(0);
      expect(startedTracker).toNotHaveReceivedEvent('run:started');
      expect(allTracker).toNotHaveReceivedEvent('run:started');
      expect(allTracker).toNotHaveReceivedEvent('run:completed');
      expect(allTracker).toNotHaveReceivedEvent('run:failed');

      // Check state remains unchanged
      expect(run.status).toBe(FlowRunStatus.Started);
      expect(run.remaining_steps).toBe(2);
    });

    test('handles completed event correctly', () => {
      const run = createFlowRun({
        run_id: RUN_ID,
        remaining_steps: 1,
      });

      const completedEvent = createRunCompletedEvent({
        run_id: RUN_ID,
        output: { result: 'success' },
      });

      // Set up event tracking before state update
      const allTracker = createEventTracker();
      const completedTracker = createEventTracker();
      run.on('*', allTracker.callback);
      run.on('completed', completedTracker.callback);

      // Update state with completed event
      const result = run.updateState(toTypedRunEvent(completedEvent));

      // Check update was accepted
      expect(result).toBe(true);

      // Check state was updated correctly
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(run.completed_at).toBeInstanceOf(Date);
      expect(run.output).toEqual({ result: 'success' });

      // Verify events were emitted with comprehensive matchers
      expect(allTracker).toHaveReceivedTotalEvents(1);
      expect(completedTracker).toHaveReceivedEvent('run:completed');
      expect(allTracker).toHaveReceivedEvent('run:completed', {
        run_id: RUN_ID,
        status: FlowRunStatus.Completed,
        output: { result: 'success' },
      });
      expect(allTracker).toNotHaveReceivedEvent('run:failed');
      expect(allTracker).toNotHaveReceivedEvent('run:started');

      // Verify attempt to update again is rejected
      const secondTracker = createEventTracker();
      run.on('*', secondTracker.callback);
      const secondResult = run.updateState(toTypedRunEvent(completedEvent));
      expect(secondResult).toBe(false);
      expect(secondTracker).toHaveReceivedTotalEvents(0);
    });

    test('handles failed event correctly', () => {
      const run = createFlowRun({
        run_id: RUN_ID,
        remaining_steps: 1,
      });

      const failedEvent = createRunFailedEvent({
        run_id: RUN_ID,
        error_message: 'Something went wrong',
      });

      // Set up event tracking before state update
      const allTracker = createEventTracker();
      const failedTracker = createEventTracker();
      run.on('*', allTracker.callback);
      run.on('failed', failedTracker.callback);

      // Update state with failed event
      const result = run.updateState(toTypedRunEvent(failedEvent));

      // Check update was accepted
      expect(result).toBe(true);

      // Check state was updated correctly
      expect(run.status).toBe(FlowRunStatus.Failed);
      expect(run.failed_at).toBeInstanceOf(Date);
      expect(run.error_message).toBe('Something went wrong');
      expect(run.error).toBeInstanceOf(Error);
      expect(run.error?.message).toBe('Something went wrong');

      // Verify events were emitted with comprehensive matchers and payload validation
      expect(allTracker).toHaveReceivedTotalEvents(1);
      expect(failedTracker).toHaveReceivedEvent('run:failed');
      expect(allTracker).toHaveReceivedEvent('run:failed', {
        run_id: RUN_ID,
        status: FlowRunStatus.Failed,
        error_message: 'Something went wrong',
      });
      expect(allTracker).toNotHaveReceivedEvent('run:completed');
      expect(allTracker).toNotHaveReceivedEvent('run:started');

      // Note: Broadcast events don't include error as Error instances
      // They only have error_message as strings (already verified above)
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
      const run = createFlowRun({ run_id: RUN_ID });
      
      const startedEvent = createRunStartedEvent({ run_id: RUN_ID });
      const completedEvent = createRunCompletedEvent({ run_id: RUN_ID });
      const failedEvent = createRunFailedEvent({ run_id: RUN_ID });

      // Started -> Started (same precedence, should be rejected)
      expect(run.status).toBe(FlowRunStatus.Started);
      const result = run.updateState(toTypedRunEvent(startedEvent));
      expect(result).toBe(false);
      expect(run.status).toBe(FlowRunStatus.Started);

      // Started -> Completed (allowed - higher precedence)
      expect(run.updateState(toTypedRunEvent(completedEvent))).toBe(true);
      expect(run.status).toBe(FlowRunStatus.Completed);

      // Completed -> Failed (denied - terminal state protection)
      const initialStatus = run.status;
      const initialOutput = run.output;
      const initialError = run.error;
      
      const updateResult = run.updateState(toTypedRunEvent(failedEvent));
      
      // Verify update was rejected
      expect(updateResult).toBe(false);
      expect(run.status).toBe(initialStatus);
      expect(run.output).toEqual(initialOutput);
      expect(run.error).toBe(initialError);
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
      const failedEvent = createRunFailedEvent({ run_id: RUN_ID });
      const result = run.updateState(toTypedRunEvent(failedEvent));

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
      const newCompletedEvent = createRunCompletedEvent({
        run_id: RUN_ID,
        output: { result: 'different result' },
      });

      // Try to update with a new completed event
      const result = run.updateState(toTypedRunEvent(newCompletedEvent));

      // Should not update terminal state even with same status
      expect(result).toBe(false);

      // Output should remain unchanged
      expect(run.output).toEqual({ result: 'success' });
    });
  });

  describe('Run Event Lifecycles', () => {
    test('happy path: started → completed with full event sequence', () => {
      const run = createFlowRun({
        run_id: RUN_ID,
        remaining_steps: 1,
      });

      const tracker = createEventTracker();
      run.on('*', tracker.callback);

      // Simulate completed event (started already happened during creation)
      const completedEvent = createRunCompletedEvent({
        run_id: RUN_ID,
        output: { final: 'result' },
      });
      run.updateState(toTypedRunEvent(completedEvent));

      // Verify event sequence and counts
      expect(tracker).toHaveReceivedTotalEvents(1);
      expect(tracker).toHaveReceivedEventCount('run:completed', 1);
      expect(tracker).toNotHaveReceivedEvent('run:failed');

      // Verify payload completeness
      expect(tracker).toHaveReceivedEvent('run:completed', {
        run_id: RUN_ID,
        status: FlowRunStatus.Completed,
        output: { final: 'result' },
      });
    });

    test('failure path: started → failed with no completed event', () => {
      const run = createFlowRun({
        run_id: RUN_ID,
        remaining_steps: 1,
      });

      const tracker = createEventTracker();
      run.on('*', tracker.callback);

      // Simulate failed event
      const failedEvent = createRunFailedEvent({
        run_id: RUN_ID,
        error_message: 'Task execution failed',
      });
      run.updateState(toTypedRunEvent(failedEvent));

      // Verify event sequence - should have failed but NOT completed
      expect(tracker).toHaveReceivedTotalEvents(1);
      expect(tracker).toHaveReceivedEventCount('run:failed', 1);
      expect(tracker).toNotHaveReceivedEvent('run:completed');

      // Verify error payload
      expect(tracker).toHaveReceivedEvent('run:failed', {
        run_id: RUN_ID,
        status: FlowRunStatus.Failed,
        error_message: 'Task execution failed',
      });
    });

    test('event ordering: terminal events come after started', () => {
      // Create run in created state to test full lifecycle
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

      const tracker = createEventTracker();
      run.on('*', tracker.callback);

      // Emit a started event first
      const startedEvent = createRunStartedEvent({ run_id: RUN_ID });
      run.updateState(toTypedRunEvent(startedEvent)); // Will be rejected as already started

      // Then completed
      const completedEvent = createRunCompletedEvent({ run_id: RUN_ID });
      run.updateState(toTypedRunEvent(completedEvent));

      // We should only have completed (started was rejected)
      expect(tracker).toHaveReceivedTotalEvents(1);
      expect(tracker).toHaveReceivedEvent('run:completed');
    });

    test('comprehensive payload validation for completed events', () => {
      const run = createFlowRun({
        run_id: RUN_ID,
        remaining_steps: 1,
      });

      const tracker = createEventTracker();
      run.on('*', tracker.callback);

      const output = {
        data: [1, 2, 3],
        metadata: { count: 3, processed: true },
      };

      const completedEvent = createRunCompletedEvent({
        run_id: RUN_ID,
        output,
      });
      run.updateState(toTypedRunEvent(completedEvent));

      // Use matchers for comprehensive payload validation
      expect(tracker).toHaveReceivedEventCount('run:completed', 1);
      expect(tracker).toHaveReceivedEvent('run:completed', {
        run_id: RUN_ID,
        status: FlowRunStatus.Completed,
        output,
        // Note: completed events don't include error, error_message fields
      });

      // Note: Broadcast events have timestamps as ISO strings, not Date objects
      // The event tracker stores them as-is (strings)
    });

    test('comprehensive payload validation for failed events', () => {
      const run = createFlowRun({
        run_id: RUN_ID,
        remaining_steps: 1,
      });

      const tracker = createEventTracker();
      run.on('*', tracker.callback);

      const errorMessage = 'Network timeout after 30s';
      const failedEvent = createRunFailedEvent({
        run_id: RUN_ID,
        error_message: errorMessage,
      });
      run.updateState(toTypedRunEvent(failedEvent));

      // Use matchers for comprehensive payload validation
      expect(tracker).toHaveReceivedEventCount('run:failed', 1);
      expect(tracker).toHaveReceivedEvent('run:failed', {
        run_id: RUN_ID,
        status: FlowRunStatus.Failed,
        error_message: errorMessage,
        // Note: failed events don't include output field
      });

      // Note: Broadcast events don't include error as Error instances
      // They only have error_message (string) and failed_at (ISO string), not Date objects
    });
  });

  describe('foreign-run events protection', () => {
    test('ignores events for different run IDs', () => {
      const run = createFlowRun({ run_id: RUN_ID });

      // Test that events with wrong run ID are rejected
      const initialStatus = run.status;
      const tracker = createEventTracker();
      run.on('*', tracker.callback);
      
      // Send event with wrong run ID
      const wrongRunId = 'wrong-run-id-12345';
      const foreignEvent = createRunStartedEvent({ run_id: wrongRunId });
      const result = run.updateState(toTypedRunEvent(foreignEvent));
      
      // Verify rejection
      expect(result).toBe(false);
      expect(run.status).toBe(initialStatus);
      expect(tracker.events).toHaveLength(0);
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
      const foreignStepEvent = createStepStartedEvent({
        run_id: 'different-run-id',
        step_slug: STEP_SLUG,
      });

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
      const run = createFlowRun({ run_id: RUN_ID });
      const completedEvent = createRunCompletedEvent({ run_id: RUN_ID });

      // Create a promise that should resolve when the status is updated
      const waitPromise = run.waitForStatus(FlowRunStatus.Completed);

      // Update the status after a delay
      setTimeout(() => {
        run.updateState(toTypedRunEvent(completedEvent));
      }, 1000);

      // Advance timers to trigger the update
      await advanceTimersAndFlush(1000);

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

      // Immediately add catch handler to avoid unhandled rejection
      const expectPromise = expect(waitPromise).rejects.toThrow(/Timeout waiting for run/);

      // Advance timers past the timeout
      await advanceTimersAndFlush(5001);

      // Wait for the expectation to complete
      await expectPromise;
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

      // Immediately add catch handler to avoid unhandled rejection
      const expectPromise = expect(waitPromise).rejects.toThrow(/Aborted waiting for run/);

      // Abort the operation
      setTimeout(() => {
        controller.abort();
      }, 1000);

      // Advance timers to trigger the abort
      await advanceTimersAndFlush(1000);

      // Wait for the expectation to complete
      await expectPromise;
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

      const completedEvent = createRunCompletedEvent({ run_id: RUN_ID });

      // Create a promise that should resolve if status is reached before timeout
      const waitPromise = run.waitForStatus(FlowRunStatus.Completed, {
        timeoutMs: 5000,
      });

      // Update status before timeout
      setTimeout(() => {
        run.updateState(toTypedRunEvent(completedEvent));
      }, 1000);

      // Advance timers partway
      await advanceTimersAndFlush(1000);

      // The promise should resolve
      const result = await waitPromise;
      expect(result).toBe(run);
      expect(run.status).toBe(FlowRunStatus.Completed);
    });

    test('resolves when target status Failed is reached', async () => {
      const run = createFlowRun({ run_id: RUN_ID });
      const failedEvent = createRunFailedEvent({
        run_id: RUN_ID,
        error_message: 'Task execution failed',
      });

      // Create a promise that should resolve when the status is updated to Failed
      const waitPromise = run.waitForStatus(FlowRunStatus.Failed);

      // Update the status after a delay
      setTimeout(() => {
        run.updateState(toTypedRunEvent(failedEvent));
      }, 1000);

      // Advance timers to trigger the update
      await advanceTimersAndFlush(1000);

      // Wait for the promise to resolve
      const result = await waitPromise;
      expect(result).toBe(run);
      expect(run.status).toBe(FlowRunStatus.Failed);
      expect(run.error_message).toBe('Task execution failed');
    });

    test('waitForStatus(Failed) times out if failure does not occur', async () => {
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

      // Should timeout after 5000ms if run never fails
      const waitPromise = run.waitForStatus(FlowRunStatus.Failed, {
        timeoutMs: 5000,
      });

      // Immediately add catch handler to avoid unhandled rejection
      const expectPromise = expect(waitPromise).rejects.toThrow(/Timeout waiting for run/);

      // Advance timers past the timeout
      await advanceTimersAndFlush(5001);

      // Wait for the expectation to complete
      await expectPromise;
    });

    test('waitForStatus(Failed) can be aborted with AbortSignal', async () => {
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

      // Create an abort controller
      const controller = new AbortController();

      // Create a promise that should be aborted
      const waitPromise = run.waitForStatus(FlowRunStatus.Failed, {
        signal: controller.signal,
      });

      // Immediately add catch handler to avoid unhandled rejection
      const expectPromise = expect(waitPromise).rejects.toThrow(/Aborted waiting for run/);

      // Abort the operation
      setTimeout(() => {
        controller.abort();
      }, 1000);

      // Advance timers to trigger the abort
      await advanceTimersAndFlush(1000);

      // Wait for the expectation to complete
      await expectPromise;
    });

    test('waitForStatus(Failed) resolves if already in Failed status', async () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Failed,
        input: { foo: 'bar' } as any,
        output: null,
        error: new Error('Already failed'),
        error_message: 'Already failed',
        started_at: new Date(),
        completed_at: null,
        failed_at: new Date(),
        remaining_steps: 1,
      });

      // Should resolve immediately since already in Failed status
      const waitPromise = run.waitForStatus(FlowRunStatus.Failed);
      const result = await waitPromise;

      expect(result).toBe(run);
      expect(run.status).toBe(FlowRunStatus.Failed);
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
      const stepStartedEvent = createStepStartedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
      });
      expect(
        run.updateStepState(
          STEP_SLUG as any,
          toTypedStepEvent(stepStartedEvent)
        )
      ).toBe(true);

      // First step should be updated
      expect(step1.status).toBe(FlowStepStatus.Started);

      // Second step should remain in created state
      expect(step2.status).toBe(FlowStepStatus.Created);

      // Update second step
      const secondStepStartedEvent = createStepStartedEvent({
        run_id: RUN_ID,
        step_slug: ANOTHER_STEP_SLUG,
      });
      expect(
        run.updateStepState(
          ANOTHER_STEP_SLUG as any,
          toTypedStepEvent(secondStepStartedEvent)
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

      // Spy on the dispose method
      const disposeSpy = vi.spyOn(run, 'dispose');

      // Add and then remove a listener
      const unsubscribe = run.on('*', vi.fn());
      unsubscribe();

      // Update to a terminal state
      const completedEvent = createRunCompletedEvent({ run_id: RUN_ID });
      run.updateState(toTypedRunEvent(completedEvent));

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
      const completedEvent = createRunCompletedEvent({ run_id: RUN_ID });
      run.updateState(toTypedRunEvent(completedEvent));

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
      const startedEvent = createRunStartedEvent({ run_id: RUN_ID });
      run.updateState(toTypedRunEvent(startedEvent));

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
      run.on('completed', callback1);
      run.on('failed', callback2);

      // Manually dispose
      run.dispose();

      // Verify event handlers are cleared by trying to trigger events
      const completedEvent = createRunCompletedEvent({ run_id: RUN_ID });
      run.updateState(toTypedRunEvent(completedEvent));

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
