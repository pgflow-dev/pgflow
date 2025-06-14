import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgflowClient } from '../src/lib/PgflowClient';
import { FlowRunStatus } from '../src/lib/types';
import { mockSupabase, resetMocks, mockChannelSubscription } from './mocks';
import {
  RUN_ID,
  FLOW_SLUG,
  startedRunSnapshot,
  stepStatesSample,
} from './fixtures';

// Mock uuid.v4 to return predictable run ID for testing
vi.mock('uuid', () => ({
  v4: () => RUN_ID,
}));

describe('Error Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  describe('RPC Error Handling', () => {
    it('handles RPC failures during startFlow gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC to fail with network error
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: new Error('Network connection failed'),
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Attempt to start flow should throw
      await expect(
        pgflowClient.startFlow(FLOW_SLUG, { input: 'test' })
      ).rejects.toThrow('Network connection failed');

      // Verify RPC was called
      expect(mocks.rpc).toHaveBeenCalledWith('start_flow_with_states', {
        flow_slug: FLOW_SLUG,
        input: { input: 'test' },
        run_id: RUN_ID,
      });
    });

    it('handles RPC failures during getRun gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC to fail with database error
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: new Error('Database query timeout'),
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Attempt to get run should return null (handled gracefully)
      const run = await pgflowClient.getRun(RUN_ID);
      expect(run).toBeNull();

      // Verify RPC was called
      expect(mocks.rpc).toHaveBeenCalledWith('get_run_with_states', {
        run_id: RUN_ID,
      });
    });

    it('handles RPC returning null data gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC to return null data (run not found)
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: null,
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Should handle null data gracefully
      const run = await pgflowClient.getRun(RUN_ID);
      expect(run).toBeNull();
    });

    it('handles malformed RPC response structure', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC to return malformed response (missing required fields)
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { invalid: 'structure' }, // Missing required fields
          steps: [],
        },
        error: null,
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Should handle malformed response gracefully
      await expect(pgflowClient.getRun(RUN_ID)).rejects.toThrow();
    });
  });

  describe('Concurrent Operation Error Handling', () => {
    it('handles mixed success and failure in concurrent startFlow calls', async () => {
      const { client, mocks } = mockSupabase();

      const flow1Input = { data: 'flow1' };
      const flow2Input = { data: 'flow2' };
      const flow3Input = { data: 'flow3' };

      // Setup mixed success/failure responses
      mocks.rpc
        .mockReturnValueOnce({
          data: {
            run: { ...startedRunSnapshot, input: flow1Input },
            steps: stepStatesSample,
          },
          error: null,
        })
        .mockReturnValueOnce({
          data: null,
          error: new Error('Flow validation failed'),
        })
        .mockReturnValueOnce({
          data: {
            run: { ...startedRunSnapshot, input: flow3Input },
            steps: stepStatesSample,
          },
          error: null,
        });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Run concurrent operations
      const results = await Promise.allSettled([
        pgflowClient.startFlow(FLOW_SLUG, flow1Input),
        pgflowClient.startFlow(FLOW_SLUG, flow2Input),
        pgflowClient.startFlow(FLOW_SLUG, flow3Input),
      ]);

      // Verify mixed results
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      if (results[0].status === 'fulfilled') {
        expect(results[0].value.input).toEqual(flow1Input);
      }

      if (results[1].status === 'rejected') {
        expect(results[1].reason.message).toContain('Flow validation failed');
      }

      if (results[2].status === 'fulfilled') {
        expect(results[2].value.input).toEqual(flow3Input);
      }

      // Verify all RPC calls were made
      expect(mocks.rpc).toHaveBeenCalledTimes(3);
    });

    it('handles timeout scenarios gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC with delayed response
      const delayedPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            data: {
              run: startedRunSnapshot,
              steps: stepStatesSample,
            },
            error: null,
          });
        }, 5000); // 5 second delay
      });

      mocks.rpc.mockReturnValueOnce(delayedPromise);

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Start the operation
      const startFlowPromise = pgflowClient.startFlow(FLOW_SLUG, {
        input: 'test',
      });

      // Advance timers by 2 seconds (less than the delay)
      vi.advanceTimersByTime(2000);

      // The promise should still be pending
      const pendingCheck = Promise.race([
        startFlowPromise,
        Promise.resolve('still-pending'),
      ]);

      expect(await pendingCheck).toBe('still-pending');

      // Advance timers to complete the operation
      vi.advanceTimersByTime(3000);

      // Now it should resolve
      const run = await startFlowPromise;
      expect(run).toBeDefined();
      expect(run.status).toBe(FlowRunStatus.Started);
    });
  });

  describe('Resource Management Under Error Conditions', () => {
    it('properly cleans up resources when startFlow fails', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC to fail
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: new Error('Database connection lost'),
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Attempt to start flow should fail
      await expect(
        pgflowClient.startFlow(FLOW_SLUG, { input: 'test' })
      ).rejects.toThrow('Database connection lost');

      // Verify no run is cached after failure
      const cachedRun = await pgflowClient.getRun(RUN_ID);
      expect(cachedRun).toBeNull();
    });

    it('handles disposal during error states', async () => {
      const { client, mocks } = mockSupabase();

      // Mock successful getRun first
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);

      expect(run).toBeDefined();

      // Disposal should work even if run is in error state
      expect(() => {
        pgflowClient.dispose(RUN_ID);
      }).not.toThrow();

      // Verify run is removed from cache
      const cachedRunAfterDisposal = await pgflowClient.getRun(RUN_ID);
      expect(cachedRunAfterDisposal).toBeNull();
    });

    it('handles disposeAll with multiple failed runs', async () => {
      const { client, mocks } = mockSupabase();

      // Mock multiple successful getRun calls
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
            run: { ...startedRunSnapshot, run_id: 'run2' },
            steps: stepStatesSample,
          },
          error: null,
        });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Get multiple runs
      const run1 = await pgflowClient.getRun(RUN_ID);
      const run2 = await pgflowClient.getRun('run2');

      expect(run1).toBeDefined();
      expect(run2).toBeDefined();

      // disposeAll should work
      expect(() => {
        pgflowClient.disposeAll();
      }).not.toThrow();

      // Verify all runs are cleaned up
      const cachedRun1 = await pgflowClient.getRun(RUN_ID);
      const cachedRun2 = await pgflowClient.getRun('run2');
      expect(cachedRun1).toBeNull();
      expect(cachedRun2).toBeNull();
    });
  });

  describe('Input Validation Error Handling', () => {
    it('handles invalid flow slug', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC to return validation error
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: new Error('Flow "invalid-flow" not found'),
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      await expect(
        pgflowClient.startFlow('invalid-flow', { input: 'test' })
      ).rejects.toThrow('Flow "invalid-flow" not found');
    });

    it('handles invalid run_id format', async () => {
      const { client, mocks } = mockSupabase();

      // Mock RPC to return validation error for invalid UUID
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: new Error('Invalid UUID format'),
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      const invalidRunId = 'not-a-uuid';

      const run = await pgflowClient.getRun(invalidRunId);
      expect(run).toBeNull();
    });

    it('handles empty or null input gracefully', async () => {
      const { client, mocks } = mockSupabase();

      // Mock successful response even with null input
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, input: null },
          steps: stepStatesSample,
        },
        error: null,
      });

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Should handle null input gracefully
      const run = await pgflowClient.startFlow(FLOW_SLUG, null as any);
      expect(run).toBeDefined();
      expect(run.input).toBeNull();
    });
  });
});
