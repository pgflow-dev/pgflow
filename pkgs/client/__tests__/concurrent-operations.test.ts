import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgflowClient } from '../src/lib/PgflowClient';
import {
  FlowRunStatus,
  FlowStepStatus,
  type FlowRunEvent,
  type StepEvent,
} from '../src/lib/types';
import { Flow } from '@pgflow/dsl';

// Create a test flow for proper typing
const TestFlow = new Flow<{ test: string }>({ slug: 'test_flow' }).step(
  { slug: 'test_step' },
  (input) => ({ result: input.run.test })
);
import { mockSupabase, resetMocks, mockChannelSubscription } from './mocks';
import {
  RUN_ID,
  FLOW_SLUG,
  STEP_SLUG,
  startedRunSnapshot,
  broadcastStepStarted,
  broadcastStepCompleted,
  broadcastRunCompleted,
  stepStatesSample,
} from './fixtures';

// Mock uuid to return predictable IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => RUN_ID),
}));

describe('Concurrent Operations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  describe('Concurrent startFlow operations', () => {
    it('handles multiple concurrent startFlow calls successfully', async () => {
      const { client, mocks } = mockSupabase();

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      const flow1Input = { data: 'flow1' };
      const flow2Input = { data: 'flow2' };
      const flow3Input = { data: 'flow3' };

      // Mock uuid to return different IDs for each call
      let callCount = 0;
      const runIds = ['run1', 'run2', 'run3'];
      vi.mocked((await import('uuid')).v4).mockImplementation(
        () => runIds[callCount++]
      );

      // Setup RPC responses for all three flows
      mocks.rpc
        .mockReturnValueOnce({
          data: {
            run: {
              ...startedRunSnapshot,
              run_id: runIds[0],
              input: flow1Input,
            },
            steps: stepStatesSample.map((s) => ({ ...s, run_id: runIds[0] })),
          },
          error: null,
        })
        .mockReturnValueOnce({
          data: {
            run: {
              ...startedRunSnapshot,
              run_id: runIds[1],
              input: flow2Input,
            },
            steps: stepStatesSample.map((s) => ({ ...s, run_id: runIds[1] })),
          },
          error: null,
        })
        .mockReturnValueOnce({
          data: {
            run: {
              ...startedRunSnapshot,
              run_id: runIds[2],
              input: flow3Input,
            },
            steps: stepStatesSample.map((s) => ({ ...s, run_id: runIds[2] })),
          },
          error: null,
        });

      // Start flows concurrently
      const [run1, run2, run3] = await Promise.all([
        pgflowClient.startFlow(FLOW_SLUG, flow1Input),
        pgflowClient.startFlow(FLOW_SLUG, flow2Input),
        pgflowClient.startFlow(FLOW_SLUG, flow3Input),
      ]);

      // Verify all flows started successfully with correct inputs
      expect(run1.run_id).toBe(runIds[0]);
      expect(run2.run_id).toBe(runIds[1]);
      expect(run3.run_id).toBe(runIds[2]);
      expect(run1.input).toEqual(flow1Input);
      expect(run2.input).toEqual(flow2Input);
      expect(run3.input).toEqual(flow3Input);

      // Verify RPC was called correctly for each
      expect(mocks.rpc).toHaveBeenCalledTimes(3);

      // Verify all runs are in correct initial state
      expect(run1.status).toBe(FlowRunStatus.Started);
      expect(run2.status).toBe(FlowRunStatus.Started);
      expect(run3.status).toBe(FlowRunStatus.Started);
    });

    it('handles same run_id being used multiple times', async () => {
      const { client, mocks } = mockSupabase();

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      const sharedRunId = '444e4567-e89b-12d3-a456-426614174000';
      const sharedInput = { shared: 'data' };

      // Setup RPC to return the same response
      const rpcResponse = {
        data: {
          run: {
            ...startedRunSnapshot,
            run_id: sharedRunId,
            input: sharedInput,
          },
          steps: stepStatesSample.map((s) => ({ ...s, run_id: sharedRunId })),
        },
        error: null,
      };

      mocks.rpc
        .mockReturnValueOnce(rpcResponse)
        .mockReturnValueOnce(rpcResponse);

      // Try to start flow with same ID twice
      const [run1, run2] = await Promise.all([
        pgflowClient.startFlow(FLOW_SLUG, sharedInput, sharedRunId),
        pgflowClient.startFlow(FLOW_SLUG, sharedInput, sharedRunId),
      ]);

      // Both should succeed and have same properties
      expect(run1.run_id).toBe(sharedRunId);
      expect(run2.run_id).toBe(sharedRunId);
      expect(run1.input).toEqual(sharedInput);
      expect(run2.input).toEqual(sharedInput);

      // Both should be in correct state
      expect(run1.status).toBe(FlowRunStatus.Started);
      expect(run2.status).toBe(FlowRunStatus.Started);
    });
  });

  describe('Event forwarding', () => {
    it('forwards run events through the client', async () => {
      const { client, mocks } = mockSupabase();

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Set up a run
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const run = await pgflowClient.getRun<typeof TestFlow>(RUN_ID);
      if (!run) throw new Error('Run not found');

      // Track events on the run
      const runEvents: string[] = [];
      run.on('*', (event) => runEvents.push(event.event_type));

      // Get the broadcast handler and emit event
      const broadcastHandler = mocks.channel.handlers.get('*');
      broadcastHandler?.({
        event: 'run:completed',
        payload: broadcastRunCompleted,
      });

      // Verify event was received
      expect(runEvents).toEqual(['run:completed']);
      expect(run.status).toBe(FlowRunStatus.Completed);
    });

    it('forwards step events through the client', async () => {
      const { client, mocks } = mockSupabase();

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Set up a run
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const run = await pgflowClient.getRun<typeof TestFlow>(RUN_ID);
      if (!run) throw new Error('Run not found');

      const step = run.step(STEP_SLUG);

      // Track events on the step
      const stepEvents: string[] = [];
      step.on('*', (event) => stepEvents.push(event.event_type));

      // Get the broadcast handler and emit events
      const broadcastHandler = mocks.channel.handlers.get('*');
      broadcastHandler?.({
        event: 'step:started',
        payload: broadcastStepStarted,
      });
      broadcastHandler?.({
        event: 'step:completed',
        payload: broadcastStepCompleted,
      });

      // Verify events were received (step was already started, so only completed event is processed)
      expect(stepEvents).toEqual(['step:completed']);
      expect(step.status).toBe(FlowStepStatus.Completed);
    });

    it('ignores events with wrong run_id', async () => {
      const { client, mocks } = mockSupabase();

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // Set up a run
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const run = await pgflowClient.getRun<typeof TestFlow>(RUN_ID);
      if (!run) throw new Error('Run not found');

      // Track events
      const events: string[] = [];
      run.on('*', (event) => events.push(event.event_type));

      // Emit event with different run_id
      const broadcastHandler = mocks.channel.handlers.get('*');
      broadcastHandler?.({
        event: 'run:completed',
        payload: { ...broadcastRunCompleted, run_id: 'different-id' },
      });

      // Should not receive event
      expect(events).toEqual([]);
      expect(run.status).toBe(FlowRunStatus.Started);
    });
  });

  describe('Error handling', () => {
    it('handles RPC errors during concurrent operations', async () => {
      const { client, mocks } = mockSupabase();

      mockChannelSubscription(mocks);

      const pgflowClient = new PgflowClient(client);

      // First call succeeds, second fails
      mocks.rpc
        .mockReturnValueOnce({
          data: {
            run: startedRunSnapshot,
            steps: stepStatesSample,
          },
          error: null,
        })
        .mockReturnValueOnce({
          data: null,
          error: { message: 'Database error' },
        });

      // Start flows concurrently - one succeeds, one fails
      const results = await Promise.allSettled([
        pgflowClient.startFlow(FLOW_SLUG, { test: 1 }),
        pgflowClient.startFlow(FLOW_SLUG, { test: 2 }),
      ]);

      // First should succeed
      expect(results[0].status).toBe('fulfilled');
      if (results[0].status === 'fulfilled') {
        expect(results[0].value.status).toBe(FlowRunStatus.Started);
      }

      // Second should fail
      expect(results[1].status).toBe('rejected');
    });
  });
});
