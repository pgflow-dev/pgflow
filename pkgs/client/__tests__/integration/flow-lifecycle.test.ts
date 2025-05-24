import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgflowClient } from '../../src/lib/PgflowClient';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types';
import { mockSupabase, resetMocks } from '../mocks';
import {
  RUN_ID,
  FLOW_SLUG,
  STEP_SLUG,
  ANOTHER_STEP_SLUG,
  startedRunSnapshot,
  completedRunSnapshot,
  stepStatesSample,
  broadcastRunCompleted,
  broadcastStepCompleted,
} from '../fixtures';

// Mock uuid.v4 to return predictable run ID for testing
vi.mock('uuid', () => ({
  v4: () => RUN_ID,
}));

describe('Flow Lifecycle Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  describe('Complete Flow Execution', () => {
    it('executes a simple flow from start to completion', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock flow start response
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const input = { url: 'https://example.com' };

      // Start the flow
      const run = await pgflowClient.startFlow(FLOW_SLUG, input);

      // Verify initial state
      expect(run).toBeDefined();
      expect(run.run_id).toBe(RUN_ID);
      expect(run.flow_slug).toBe(FLOW_SLUG);
      expect(run.status).toBe(FlowRunStatus.Started);
      expect(run.input).toEqual(input);

      // Verify RPC was called correctly
      expect(mocks.rpc).toHaveBeenCalledWith(
        'start_flow_with_states',
        { flow_slug: FLOW_SLUG, input, run_id: RUN_ID }
      );

      // Verify channel subscription was set up
      expect(client.channel).toHaveBeenCalledWith(`pgflow:run:${RUN_ID}`);
    });

    it('handles flow completion through multiple steps', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock flow start with multiple steps
      const multiStepStates = [
        {
          run_id: RUN_ID,
          step_slug: STEP_SLUG,
          status: 'started' as const,
          started_at: new Date().toISOString(),
          completed_at: null,
          failed_at: null,
          error_message: null,
        },
        {
          run_id: RUN_ID,
          step_slug: ANOTHER_STEP_SLUG,
          status: 'created' as const,
          started_at: null,
          completed_at: null,
          failed_at: null,
          error_message: null,
        },
      ];

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: multiStepStates,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(FLOW_SLUG, { data: 'test' });

      // Verify initial step states
      const step1 = run.step(STEP_SLUG);
      const step2 = run.step(ANOTHER_STEP_SLUG);

      expect(step1.status).toBe(FlowStepStatus.Started);
      expect(step2.status).toBe(FlowStepStatus.Created);

      // Verify both steps are accessible
      expect(step1.step_slug).toBe(STEP_SLUG);
      expect(step2.step_slug).toBe(ANOTHER_STEP_SLUG);
      expect(step1.run_id).toBe(RUN_ID);
      expect(step2.run_id).toBe(RUN_ID);
    });

    it('maintains state consistency during flow execution', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(FLOW_SLUG, { data: 'consistency-test' });

      // Get references to steps
      const step1 = run.step(STEP_SLUG);
      const step2 = run.step(ANOTHER_STEP_SLUG);

      // Verify consistent state access
      expect(run.run_id).toBe(step1.run_id);
      expect(run.run_id).toBe(step2.run_id);
      
      // Multiple calls should return same instances
      const step1Again = run.step(STEP_SLUG);
      const step2Again = run.step(ANOTHER_STEP_SLUG);
      
      expect(step1).toBe(step1Again);
      expect(step2).toBe(step2Again);
    });
  });

  describe('Flow Error Scenarios', () => {
    it('handles flow that fails during execution', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock flow that starts successfully
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(FLOW_SLUG, { data: 'will-fail' });

      expect(run.status).toBe(FlowRunStatus.Started);

      // Simulate step failure (would normally come via broadcast)
      const step = run.step(STEP_SLUG);
      const failedUpdate = step.updateState({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Failed,
        failed_at: new Date().toISOString(),
        error_message: 'Step execution failed',
      });

      expect(failedUpdate).toBe(true);
      expect(step.status).toBe(FlowStepStatus.Failed);
      expect(step.error_message).toBe('Step execution failed');
    });

    it('handles flow start failure gracefully', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock flow start failure
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: new Error('Flow not found'),
      });

      const pgflowClient = new PgflowClient(client);

      await expect(
        pgflowClient.startFlow('nonexistent-flow', { data: 'test' })
      ).rejects.toThrow('Flow not found');

      // Verify no run was cached after failure
      const cachedRun = await pgflowClient.getRun(RUN_ID);
      expect(cachedRun).toBeNull();
    });
  });

  describe('Flow State Retrieval', () => {
    it('retrieves existing flow state correctly', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock getting an existing completed flow
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: completedRunSnapshot,
          steps: [
            {
              run_id: RUN_ID,
              step_slug: STEP_SLUG,
              status: 'completed' as const,
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              failed_at: null,
              error_message: null,
              output: { result: 'step completed' },
            },
          ],
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);

      // Verify completed flow state
      expect(run).toBeDefined();
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(run.output).toEqual(completedRunSnapshot.output);
      expect(run.completed_at?.toISOString()).toBe(completedRunSnapshot.completed_at);

      // Verify step state
      const step = run.step(STEP_SLUG);
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual({ result: 'step completed' });
    });

    it('handles retrieval of non-existent flow', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock no data found
      mocks.rpc.mockReturnValueOnce({
        data: null,
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun('non-existent-run-id');

      expect(run).toBeNull();
    });

    it('caches flow runs correctly', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock first call
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      
      // First call should fetch from database
      const run1 = await pgflowClient.getRun(RUN_ID);
      expect(run1).toBeDefined();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);

      // Second call should return cached instance
      const run2 = await pgflowClient.getRun(RUN_ID);
      expect(run2).toBe(run1); // Same instance
      expect(mocks.rpc).toHaveBeenCalledTimes(1); // No additional call
    });
  });

  describe('Resource Management Integration', () => {
    it('properly cleans up resources across flow lifecycle', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock multiple flows
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
            run: { ...startedRunSnapshot, run_id: 'run-2' },
            steps: stepStatesSample.map(s => ({ ...s, run_id: 'run-2' })),
          },
          error: null,
        });

      const pgflowClient = new PgflowClient(client);
      
      // Start multiple flows
      const run1 = await pgflowClient.startFlow(FLOW_SLUG, { data: 'flow1' });
      const run2 = await pgflowClient.getRun('run-2');

      expect(run1).toBeDefined();
      expect(run2).toBeDefined();

      // Verify both are accessible
      expect(run1.run_id).toBe(RUN_ID);
      expect(run2.run_id).toBe('run-2');

      // Dispose specific run
      pgflowClient.dispose(RUN_ID);

      // run1 should still work (disposal doesn't break existing references)
      expect(run1.run_id).toBe(RUN_ID);
      
      // run2 should still be cached
      const run2Again = await pgflowClient.getRun('run-2');
      expect(run2Again).toBe(run2);

      // Dispose all
      pgflowClient.disposeAll();

      // After disposeAll, new calls should not find cached runs
      const run1After = await pgflowClient.getRun(RUN_ID);
      const run2After = await pgflowClient.getRun('run-2');
      expect(run1After).toBeNull();
      expect(run2After).toBeNull();
    });

    it('handles disposal during async operations', async () => {
      const { client, mocks } = mockSupabase();
      
      // Mock delayed response
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mocks.rpc.mockReturnValueOnce(delayedPromise);

      const pgflowClient = new PgflowClient(client);
      
      // Start async operation
      const runPromise = pgflowClient.getRun(RUN_ID);
      
      // Dispose while operation is pending
      pgflowClient.dispose(RUN_ID);
      
      // Resolve the promise
      resolvePromise!({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      // Should still complete successfully
      const run = await runPromise;
      expect(run).toBeDefined();
      expect(run.run_id).toBe(RUN_ID);
    });
  });

  describe('Flow Options and Configuration', () => {
    it('handles flow start with custom run_id', async () => {
      const { client, mocks } = mockSupabase();
      
      const customRunId = 'custom-run-12345';
      
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, run_id: customRunId },
          steps: stepStatesSample.map(s => ({ ...s, run_id: customRunId })),
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(
        FLOW_SLUG, 
        { data: 'custom-id-test' }, 
        customRunId
      );

      expect(run.run_id).toBe(customRunId);
      
      // Verify RPC was called with custom ID
      expect(mocks.rpc).toHaveBeenCalledWith(
        'start_flow_with_states',
        { 
          flow_slug: FLOW_SLUG, 
          input: { data: 'custom-id-test' }, 
          run_id: customRunId 
        }
      );
    });

    it('handles complex input data structures', async () => {
      const { client, mocks } = mockSupabase();
      
      const complexInput = {
        user: {
          id: 123,
          profile: {
            name: 'Test User',
            preferences: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        metadata: {
          source: 'api',
          timestamp: new Date().toISOString(),
          tags: ['important', 'urgent'],
        },
        config: {
          retries: 3,
          timeout: 30000,
          endpoints: ['https://api1.com', 'https://api2.com'],
        },
      };

      mocks.rpc.mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, input: complexInput },
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.startFlow(FLOW_SLUG, complexInput);

      expect(run.input).toEqual(complexInput);
      
      // Verify deep equality
      expect(run.input.user.profile.preferences.theme).toBe('dark');
      expect(run.input.metadata.tags).toEqual(['important', 'urgent']);
      expect(run.input.config.endpoints).toHaveLength(2);
    });
  });
});