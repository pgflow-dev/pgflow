import { describe, it, expect, vi } from 'vitest';
import { PgflowClient } from '../../src/lib/PgflowClient';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types';
import { Flow } from '@pgflow/dsl';
import {
  setupTestEnvironment,
  createMockClient,
  createRunResponse,
  mockRpcCall,
  emitBroadcastEvent,
  mockSequentialUuids,
  setupConcurrentOperations,
  createEventTracker,
  createSyncSchedule,
} from '../helpers/test-utils';
import {
  createStepStartedEvent,
  createStepCompletedEvent,
  createRunCompletedEvent,
} from '../helpers/event-factories';
import { RUN_ID, FLOW_SLUG, STEP_SLUG, startedRunSnapshot, stepStatesSample } from '../fixtures';

// Create a test flow for proper typing
const TestFlow = new Flow<{ test: string }>({ slug: 'test_flow' }).step(
  { slug: 'test_step' },
  (input) => ({ result: input.run.test })
);

// Mock uuid to return predictable IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => RUN_ID),
}));

describe('Concurrent Operations', () => {
  setupTestEnvironment();

  describe('Concurrent startFlow operations', () => {
    it('handles multiple concurrent startFlow calls successfully', async () => {
      const { client, mocks } = createMockClient();
      
      // Mock RPC to return success for any call
      mocks.rpc.mockImplementation(async (name: string, params: any) => {
        if (name === 'start_flow_with_states') {
          return {
            data: {
              run: {
                run_id: params.run_id,
                flow_slug: params.flow_slug,
                status: 'started',
                input: params.input,
                output: null,
                started_at: new Date().toISOString(),
                completed_at: null,
                failed_at: null,
                remaining_steps: 0,
              },
              steps: [],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

      const flow1Input = { data: 'flow1' };
      const flow2Input = { data: 'flow2' };
      const flow3Input = { data: 'flow3' };

      // Start flows concurrently
      const { succeeded, failed } = await setupConcurrentOperations([
        () => pgflowClient.startFlow(FLOW_SLUG, flow1Input),
        () => pgflowClient.startFlow(FLOW_SLUG, flow2Input),
        () => pgflowClient.startFlow(FLOW_SLUG, flow3Input),
      ]);

      // Verify all flows started successfully
      expect(failed).toHaveLength(0);
      expect(succeeded).toHaveLength(3);
      const [run1, run2, run3] = succeeded;

      // Verify all flows started successfully with correct inputs
      expect(run1.run_id).toBeDefined();
      expect(run2.run_id).toBeDefined();
      expect(run3.run_id).toBeDefined();
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
      const { client, mocks } = createMockClient();


      const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

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
      const { client, mocks } = createMockClient();
      const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

      // Set up a run
      const response = createRunResponse({ run_id: RUN_ID });
      mockRpcCall(mocks, response);

      const run = await pgflowClient.getRun<typeof TestFlow>(RUN_ID);
      if (!run) throw new Error('Run not found');

      // Track events on the run with event tracker
      const runTracker = createEventTracker();
      run.on('*', runTracker.callback);

      // Emit completed event
      const output = { final: 'result' };
      const completedEvent = createRunCompletedEvent({
        run_id: RUN_ID,
        output,
      });
      emitBroadcastEvent(mocks, 'run:completed', completedEvent);

      // Verify event was received with comprehensive matchers
      expect(runTracker).toHaveReceivedTotalEvents(1);
      expect(runTracker).toHaveReceivedEventCount('run:completed', 1);
      expect(runTracker).toHaveReceivedEvent('run:completed', {
        run_id: RUN_ID,
        status: FlowRunStatus.Completed,
        output,
      });
      expect(runTracker).toNotHaveReceivedEvent('run:failed');
      expect(runTracker).toNotHaveReceivedEvent('run:started');

      // Verify run state was updated
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(run.output).toEqual(output);
    });

    it('forwards step events through the client', async () => {
      const { client, mocks } = createMockClient();

      const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

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

      const step = run.step(STEP_SLUG as any);

      // Track events on the step with event tracker
      const stepTracker = createEventTracker();
      step.on('*', stepTracker.callback);

      // Get the broadcast handler and emit events
      const startedEvent = createStepStartedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
      });
      const output = { step_result: 'success' };
      const completedEvent = createStepCompletedEvent({
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        output,
      });

      emitBroadcastEvent(mocks, 'step:started', startedEvent);
      emitBroadcastEvent(mocks, 'step:completed', completedEvent);

      // Verify events were received with comprehensive matchers
      // Note: step was already in 'started' state from stepStatesSample,
      // so the started event is rejected and only completed is processed
      expect(stepTracker).toHaveReceivedTotalEvents(1);
      expect(stepTracker).toHaveReceivedEventCount('step:completed', 1);
      expect(stepTracker).toHaveReceivedEvent('step:completed', {
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: FlowStepStatus.Completed,
        output,
      });
      expect(stepTracker).toNotHaveReceivedEvent('step:started');
      expect(stepTracker).toNotHaveReceivedEvent('step:failed');

      // Verify step state was updated
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual(output);
    });

    it('ignores events with wrong run_id', async () => {
      const { client, mocks } = createMockClient();

      const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

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

      // Track events with event tracker
      const runTracker = createEventTracker();
      run.on('*', runTracker.callback);

      // Emit event with different run_id
      const wrongRunId = 'different-id-12345';
      const wrongRunEvent = createRunCompletedEvent({
        run_id: wrongRunId,
        output: { should: 'be ignored' },
      });
      emitBroadcastEvent(mocks, 'run:completed', wrongRunEvent);

      // Verify no events were received using comprehensive matchers
      expect(runTracker).toHaveReceivedTotalEvents(0);
      expect(runTracker).toNotHaveReceivedEvent('run:completed');
      expect(runTracker).toNotHaveReceivedEvent('run:failed');
      expect(runTracker).toNotHaveReceivedEvent('run:started');

      // Verify run state remains unchanged
      expect(run.status).toBe(FlowRunStatus.Started);
      expect(run.output).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('handles RPC errors during concurrent operations', async () => {
      const { client, mocks } = createMockClient();


      const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

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
