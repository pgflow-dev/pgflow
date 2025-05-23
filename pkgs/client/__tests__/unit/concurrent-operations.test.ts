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
  broadcastStepStarted,
  broadcastStepCompleted,
  broadcastRunCompleted,
  stepStatesSample,
} from '../fixtures';

// Mock uuid.v4 to return predictable run IDs for testing
let runIdCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `${RUN_ID.substring(0, 30)}${runIdCounter++.toString().padStart(6, '0')}`,
}));

describe('Concurrent Operations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runIdCounter = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  describe('Out-of-order event handling', () => {
    it('handles completed event arriving before started event', async () => {
      const { client, mocks } = mockSupabase();
      
      // Setup RPC response for getRun
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);
      const step = run.step(STEP_SLUG);
      
      // Track step status changes
      const statusChanges: FlowStepStatus[] = [];
      step.on((event) => {
        statusChanges.push(event.status);
      });

      // Get the broadcast handler and emit events out of order
      const broadcastHandler = mocks.channel.handlers.get('*');
      
      // Emit completed event first (out of order)
      broadcastHandler?.({ 
        event: 'step:completed', 
        payload: broadcastStepCompleted 
      });
      
      // Then emit started event
      broadcastHandler?.({ 
        event: 'step:started', 
        payload: broadcastStepStarted 
      });

      // Verify final state is correct despite out-of-order delivery
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(step.output).toEqual(broadcastStepCompleted.output);
      
      // Verify we only got the completed event (higher precedence)
      expect(statusChanges).toEqual([FlowStepStatus.Completed]);
    });

    it('processes events in status precedence order regardless of arrival time', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);
      
      // Track run events
      const runEvents: string[] = [];
      run.on((event) => {
        runEvents.push(event.event_type);
      });

      const broadcastHandler = mocks.channel.handlers.get('*');

      // Emit run completed first
      broadcastHandler?.({ 
        event: 'run:completed', 
        payload: broadcastRunCompleted 
      });
      
      // Then emit step events (these should still be processed)
      broadcastHandler?.({ 
        event: 'step:started', 
        payload: broadcastStepStarted 
      });
      broadcastHandler?.({ 
        event: 'step:completed', 
        payload: broadcastStepCompleted 
      });

      // Verify run reached final state
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(run.output).toEqual(broadcastRunCompleted.output);
      
      // Verify step still got updated (events are processed independently)
      const step = run.step(STEP_SLUG);
      expect(step.status).toBe(FlowStepStatus.Completed);
      
      // Verify run event was emitted
      expect(runEvents).toEqual(['run:completed']);
    });
  });

  describe('Rapid event processing', () => {
    it('processes rapid burst of events without dropping any', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);
      const step = run.step(STEP_SLUG);
      const anotherStep = run.step(ANOTHER_STEP_SLUG);
      
      // Track all events
      const runEvents: string[] = [];
      const stepEvents: string[] = [];
      const anotherStepEvents: string[] = [];

      run.on((event) => runEvents.push(event.event_type));
      step.on((event) => stepEvents.push(event.event_type));
      anotherStep.on((event) => anotherStepEvents.push(event.event_type));

      const broadcastHandler = mocks.channel.handlers.get('*');

      // Emit rapid sequence of events
      const events = [
        { event: 'step:started', payload: broadcastStepStarted },
        { event: 'step:started', payload: { ...broadcastStepStarted, step_slug: ANOTHER_STEP_SLUG } },
        { event: 'step:completed', payload: broadcastStepCompleted },
        { event: 'step:completed', payload: { ...broadcastStepCompleted, step_slug: ANOTHER_STEP_SLUG } },
        { event: 'run:completed', payload: broadcastRunCompleted },
      ];

      // Emit all events in rapid succession
      events.forEach(({ event, payload }) => {
        broadcastHandler?.({ event, payload });
      });
      
      // Verify all events were processed
      expect(runEvents).toEqual(['run:completed']);
      expect(stepEvents).toEqual(['step:started', 'step:completed']);
      expect(anotherStepEvents).toEqual(['step:started', 'step:completed']);
      
      // Verify final states
      expect(run.status).toBe(FlowRunStatus.Completed);
      expect(step.status).toBe(FlowStepStatus.Completed);
      expect(anotherStep.status).toBe(FlowStepStatus.Completed);
    });
  });

  describe('Multiple flow isolation', () => {
    it('routes events to correct flows based on run_id', async () => {
      const { client, mocks } = mockSupabase();
      const RUN_ID_2 = '223e4567-e89b-12d3-a456-426614174000';
      
      // Setup RPC responses for both runs
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
            run: { ...startedRunSnapshot, run_id: RUN_ID_2 },
            steps: stepStatesSample.map(s => ({ ...s, run_id: RUN_ID_2 })),
          },
          error: null,
        });

      const pgflowClient = new PgflowClient(client);
      
      // Get both runs
      const [run1, run2] = await Promise.all([
        pgflowClient.getRun(RUN_ID),
        pgflowClient.getRun(RUN_ID_2),
      ]);

      const events1: string[] = [];
      const events2: string[] = [];

      run1.on((event) => events1.push(event.event_type));
      run2.on((event) => events2.push(event.event_type));

      const broadcastHandler = mocks.channel.handlers.get('*');

      // Emit events for both runs - the adapter should route correctly by run_id
      broadcastHandler?.({ 
        event: 'step:started', 
        payload: broadcastStepStarted // run_id = RUN_ID
      });
      broadcastHandler?.({ 
        event: 'step:started', 
        payload: { ...broadcastStepStarted, run_id: RUN_ID_2 }
      });
      broadcastHandler?.({ 
        event: 'run:completed', 
        payload: broadcastRunCompleted // run_id = RUN_ID
      });
      broadcastHandler?.({ 
        event: 'run:completed', 
        payload: { ...broadcastRunCompleted, run_id: RUN_ID_2 }
      });

      // Verify each run only received its own events
      expect(events1).toEqual(['run:completed']);
      expect(events2).toEqual(['run:completed']);
      
      // Verify final states
      expect(run1.status).toBe(FlowRunStatus.Completed);
      expect(run2.status).toBe(FlowRunStatus.Completed);
      expect(run1.run_id).toBe(RUN_ID);
      expect(run2.run_id).toBe(RUN_ID_2);
    });
  });

  describe('Concurrent startFlow operations', () => {
    it('handles multiple concurrent startFlow calls successfully', async () => {
      const { client, mocks } = mockSupabase();
      
      const flow1Input = { data: 'flow1' };
      const flow2Input = { data: 'flow2' };
      const flow3Input = { data: 'flow3' };

      // Setup RPC responses for all three flows
      mocks.rpc
        .mockReturnValueOnce({
          data: {
            run: { ...startedRunSnapshot, input: flow1Input },
            steps: stepStatesSample,
          },
          error: null,
        })
        .mockReturnValueOnce({
          data: {
            run: { ...startedRunSnapshot, input: flow2Input },
            steps: stepStatesSample,
          },
          error: null,
        })
        .mockReturnValueOnce({
          data: {
            run: { ...startedRunSnapshot, input: flow3Input },
            steps: stepStatesSample,
          },
          error: null,
        });

      const pgflowClient = new PgflowClient(client);

      // Start flows concurrently
      const [run1, run2, run3] = await Promise.all([
        pgflowClient.startFlow(FLOW_SLUG, flow1Input),
        pgflowClient.startFlow(FLOW_SLUG, flow2Input),
        pgflowClient.startFlow(FLOW_SLUG, flow3Input),
      ]);

      // Verify all flows started successfully with correct inputs
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
      
      const sharedRunId = '444e4567-e89b-12d3-a456-426614174000';
      const sharedInput = { shared: 'data' };

      // Setup RPC to return the same response
      const rpcResponse = {
        data: {
          run: { ...startedRunSnapshot, run_id: sharedRunId, input: sharedInput },
          steps: stepStatesSample.map(s => ({ ...s, run_id: sharedRunId })),
        },
        error: null,
      };

      mocks.rpc
        .mockReturnValueOnce(rpcResponse)
        .mockReturnValueOnce(rpcResponse);

      const pgflowClient = new PgflowClient(client);

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

  describe('Event handling resilience', () => {
    it('continues processing events after malformed events', async () => {
      const { client, mocks } = mockSupabase();
      
      mocks.rpc.mockReturnValueOnce({
        data: {
          run: startedRunSnapshot,
          steps: stepStatesSample,
        },
        error: null,
      });

      const pgflowClient = new PgflowClient(client);
      const run = await pgflowClient.getRun(RUN_ID);
      const step = run.step(STEP_SLUG);
      
      const runEvents: string[] = [];
      const stepEvents: string[] = [];
      
      run.on((event) => runEvents.push(event.event_type));
      step.on((event) => stepEvents.push(event.event_type));

      const broadcastHandler = mocks.channel.handlers.get('*');

      // Emit valid event
      broadcastHandler?.({ 
        event: 'step:started', 
        payload: broadcastStepStarted 
      });

      // Emit malformed events (missing required fields)
      broadcastHandler?.({ 
        event: 'step:invalid', 
        payload: { invalid: 'data' } 
      });
      broadcastHandler?.({ 
        event: 'run:unknown', 
        payload: null 
      });

      // Emit another valid event
      broadcastHandler?.({ 
        event: 'step:completed', 
        payload: broadcastStepCompleted 
      });

      // Verify valid events were processed despite malformed ones
      expect(stepEvents).toEqual(['step:started', 'step:completed']);
      expect(step.status).toBe(FlowStepStatus.Completed);
      
      // Malformed events should not crash the system
      expect(runEvents).toEqual([]);
      expect(run.status).toBe(FlowRunStatus.Started);
    });
  });
});