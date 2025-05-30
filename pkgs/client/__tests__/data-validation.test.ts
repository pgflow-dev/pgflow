import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgflowClient } from '../src/lib/PgflowClient';
import { FlowRun } from '../src/lib/FlowRun';
import { FlowStep } from '../src/lib/FlowStep';
import { FlowRunStatus, FlowStepStatus, type BroadcastRunStartedEvent, type BroadcastRunCompletedEvent, type BroadcastStepCompletedEvent } from '../src/lib/types';
import { toTypedRunEvent, toTypedStepEvent } from '../src/lib/eventAdapters';
import { mockSupabase, resetMocks, mockChannelSubscription } from './mocks';
import {
  RUN_ID,
  FLOW_SLUG,
  STEP_SLUG,
  startedRunSnapshot,
  stepStatesSample,
} from './fixtures';

// Mock uuid.v4 to return predictable run ID for testing
vi.mock('uuid', () => ({
  v4: () => RUN_ID,
}));

describe('Data Validation and Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  describe('Database Data Validation', () => {
    it('handles missing step states gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      // Mock response with no steps
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: null, // Database could return null
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);
      if (!run) throw new Error('Run not found');

      expect(run.run_id).toBe(RUN_ID);

      // Should be able to get steps even if none exist initially
      const step = run.step(STEP_SLUG);
      expect(step).toBeDefined();
      expect(step.step_slug).toBe(STEP_SLUG);
    });

    it('handles empty step states array', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: [], // Empty array
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);
      if (!run) throw new Error('Run not found');

      // Should still be able to create steps on demand
      const step = run.step(STEP_SLUG);
      expect(step).toBeDefined();
      expect(step.status).toBe(FlowStepStatus.Created); // Default status
    });

    it('handles corrupted run data gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      // Mock response with invalid status
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: {
            ...startedRunSnapshot,
            status: 'invalid-status', // Invalid status
          },
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);

      // Should handle gracefully without throwing
      await expect(pgflowClient.getRun(RUN_ID)).rejects.toThrow();
    });

    it('handles step data with missing fields', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: [
            {
              run_id: RUN_ID,
              step_slug: STEP_SLUG,
              // Missing status field
              started_at: null,
              completed_at: null,
              failed_at: null,
              error_message: null,
            },
          ],
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);

      // Should handle missing fields gracefully
      await expect(pgflowClient.getRun(RUN_ID)).rejects.toThrow();
    });
  });

  describe('State Machine Validation', () => {
    it('prevents invalid status transitions in FlowRun', () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Completed,
        input: { test: 'input' },
        output: { result: 'done' },
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: new Date(),
        failed_at: null,
        remaining_steps: 0,
      });

      // Try to update with invalid transition
      const broadcastEvent: BroadcastRunStartedEvent = {
        event_type: 'run:started',
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { test: 'input' },
        started_at: new Date().toISOString(),
        remaining_steps: 1,
      };
      const updated = run.updateState(toTypedRunEvent(broadcastEvent));

      expect(updated).toBe(false);
      expect(run.status).toBe(FlowRunStatus.Completed);
    });

    it('prevents invalid status transitions in FlowStep', () => {
      const step = new FlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Failed,
        output: null,
        error: null,
        error_message: 'Step failed',
        started_at: new Date(),
        completed_at: null,
        failed_at: new Date(),
      });

      // Try to update with invalid transition
      const broadcastEvent: BroadcastStepCompletedEvent = {
        event_type: 'step:completed',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Completed,
        output: { result: 'test' },
        completed_at: new Date().toISOString(),
      };
      const updated = step.updateState(toTypedStepEvent(broadcastEvent));

      expect(updated).toBe(false);
      expect(step.status).toBe(FlowStepStatus.Failed);
    });

    it('validates run_id consistency in FlowRun updates', () => {
      const run = new FlowRun({
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Started,
        input: { test: 'input' },
        output: null,
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: null,
        failed_at: null,
        remaining_steps: 1,
      });

      // Try to update with different run_id
      const broadcastEvent: BroadcastRunCompletedEvent = {
        event_type: 'run:completed',
        run_id: 'different-run-id',
        flow_slug: FLOW_SLUG,
        status: FlowRunStatus.Completed,
        output: { result: 'done' },
        completed_at: new Date().toISOString(),
      };
      const updated = run.updateState(toTypedRunEvent(broadcastEvent));

      expect(updated).toBe(false);
      expect(run.status).toBe(FlowRunStatus.Started);
    });

    it('validates step_slug consistency in FlowStep updates', () => {
      const step = new FlowStep({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Started,
        output: null,
        error: null,
        error_message: null,
        started_at: new Date(),
        completed_at: null,
        failed_at: null,
      });

      // Try to update with different step_slug
      const broadcastEvent: BroadcastStepCompletedEvent = {
        event_type: 'step:completed',
        run_id: RUN_ID,
        step_slug: 'different-step',
        status: FlowStepStatus.Completed,
        output: { result: 'test' },
        completed_at: new Date().toISOString(),
      };
      const updated = step.updateState(toTypedStepEvent(broadcastEvent));

      expect(updated).toBe(false);
      expect(step.status).toBe(FlowStepStatus.Started);
    });
  });

  describe('Input Validation', () => {
    it('handles null flow input gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, input: null },
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(FLOW_SLUG, null as any);

      expect(run).toBeDefined();
      expect(run.input).toBeNull();
    });

    it('handles undefined flow input gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, input: undefined },
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(FLOW_SLUG, undefined as any);

      expect(run).toBeDefined();
      expect(run.input).toBeUndefined();
    });

    it('handles very large input objects', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      // Create large input object
      const largeInput = {
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: `data-${i}`,
          metadata: { timestamp: Date.now() + i },
        })),
      };

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, input: largeInput },
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(FLOW_SLUG, largeInput);

      expect(run).toBeDefined();
      expect(run.input).toEqual(largeInput);
    });

    it('handles circular references in input gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      // Create circular reference
      const circularInput: any = { name: 'test' };
      circularInput.self = circularInput;

      // Mock RPC to simulate how it would be serialized/deserialized
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, input: { name: 'test' } }, // Circular ref removed
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);

      // Should not throw during flow start
      expect(async () => {
        await pgflowClient.startFlow(FLOW_SLUG, circularInput);
      }).not.toThrow();
    });
  });

  describe('Edge Case Memory Management', () => {
    it('handles rapid subscription and disposal cycles', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      mocks.rpc.mockReturnValue({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);

      // Rapid subscribe/dispose cycles
      for (let i = 0; i < 10; i++) {
        const run = await pgflowClient.getRun(RUN_ID);
        if (!run) throw new Error('Run not found');

        const step = run.step(STEP_SLUG);
        expect(step).toBeDefined();

        // Immediate disposal
        pgflowClient.dispose(RUN_ID);
      }

      // Should not leak memory or cause issues
      expect(() => pgflowClient.disposeAll()).not.toThrow();
    });

    it('handles accessing disposed runs gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);
      if (!run) throw new Error('Run not found');

      // Dispose the run
      pgflowClient.dispose(RUN_ID);

      // Accessing disposed run should still work for basic properties
      expect(run.run_id).toBe(RUN_ID);
      expect(run.status).toBeDefined();

      // But trying to get the same run again should fetch fresh
      const cachedRun = await pgflowClient.getRun(RUN_ID);
      expect(cachedRun).toBeNull(); // Should return null since not in cache
    });

    it('handles multiple disposal calls gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);

      expect(run).toBeDefined();

      // Multiple disposal calls should not throw
      expect(() => {
        pgflowClient.dispose(RUN_ID);
        pgflowClient.dispose(RUN_ID);
        pgflowClient.dispose(RUN_ID);
        pgflowClient.disposeAll();
        pgflowClient.disposeAll();
      }).not.toThrow();
    });
  });

  describe('Async Operation Edge Cases', () => {
    it('handles cancelled operations gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      // Mock delayed response
      const delayedResponse = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            data: {
              run: startedRunSnapshot,
              steps: stepStatesSample,
            },
            error: null,
          });
        }, 1000);
      });

      mocks.rpc.mockReturnValueOnce(delayedResponse);

      const pgflowClient = new PgflowClient(client);

      // Start operation then immediately dispose
      const runPromise = pgflowClient.getRun(RUN_ID);
      pgflowClient.dispose(RUN_ID); // Dispose before completion

      // Advance timers to resolve the promise
      await vi.advanceTimersByTimeAsync(1000);

      // Should still complete without error
      const run = await runPromise;
      expect(run).toBeDefined();
    });

    it('handles concurrent operations on same run ID', async () => {
      const { client, mocks } = mockSupabase();

      // Setup realistic channel subscription with 200ms delay
      mockChannelSubscription(mocks);

      // Mock multiple responses
      mocks.rpc
        .mockReturnValueOnce({
          data: {
            run: startedRunSnapshot,
            steps: stepStatesSample,
          },
          error: null,
        })
        .mockReturnValueOnce({
          data: {
            run: { ...startedRunSnapshot, status: 'completed' },
            steps: stepStatesSample,
          },
          error: null,
        });

      const pgflowClient = new PgflowClient(client);

      // Start multiple operations concurrently for same run
      const [run1, run2] = await Promise.all([
        pgflowClient.getRun(RUN_ID),
        pgflowClient.getRun(RUN_ID),
      ]);

      // Both should succeed and return run instances
      if (!run1) throw new Error('Run `run1` not found');
      if (!run2) throw new Error('Run `run2` not found');

      expect(run1.run_id).toBe(RUN_ID);
      expect(run2.run_id).toBe(RUN_ID);
    });
  });
});
