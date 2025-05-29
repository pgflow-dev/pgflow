import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgflowClient } from '../src/lib/PgflowClient';
import { FlowRunStatus, FlowStepStatus } from '../src/lib/types';
import { 
  RUN_ID, 
  FLOW_SLUG, 
 
  broadcastRunCompleted, 
  broadcastStepStarted,
  startedRunSnapshot,
  startedStepState
} from './fixtures';
import { mockSupabase, resetMocks, mockChannelSubscription } from './mocks';

// Mock uuid.v4 to return a predictable run ID for testing
vi.mock('uuid', () => ({
  v4: () => RUN_ID,
}));

describe('PgflowClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  test('initializes correctly', () => {
    const { client } = mockSupabase();
    const pgflowClient = new PgflowClient(client);
    
    expect(pgflowClient).toBeDefined();
  });

  test('startFlow calls RPC with correct parameters and returns run', async () => {
    const { client, mocks } = mockSupabase();
    
    // Setup realistic channel subscription
    mockChannelSubscription(mocks);
    
    // Mock the RPC call to return run state and steps
    mocks.rpc.mockReturnValueOnce({
      data: {
        run: startedRunSnapshot,
        steps: [startedStepState],
      },
      error: null,
    });
    
    const pgflowClient = new PgflowClient(client);
    
    const input = { foo: 'bar' };
    const run = await pgflowClient.startFlow(FLOW_SLUG, input);
    
    // Check RPC call
    expect(mocks.rpc).toHaveBeenCalledWith('start_flow_with_states', {
      flow_slug: FLOW_SLUG,
      input,
      run_id: RUN_ID,
    });
    
    // Check that the run is initialized correctly
    expect(run.run_id).toBe(RUN_ID);
    expect(run.flow_slug).toBe(FLOW_SLUG);
    expect(run.status).toBe(FlowRunStatus.Started);
    
    // Check that the realtime adapter is subscribed
    expect(client.channel).toHaveBeenCalledWith(`pgflow:run:${RUN_ID}`);
  });

  test('startFlow handles error from RPC', async () => {
    const { client, mocks } = mockSupabase();
    
    // Setup realistic channel subscription (though it shouldn't reach subscription)
    mockChannelSubscription(mocks);
    
    // Mock the RPC call to return an error
    const error = new Error('RPC error');
    mocks.rpc.mockReturnValueOnce({
      data: null,
      error,
    });
    
    const pgflowClient = new PgflowClient(client);
    
    // The startFlow call should reject with the error
    await expect(pgflowClient.startFlow(FLOW_SLUG, { foo: 'bar' }))
      .rejects.toThrow(error);
  });

  test('getRun returns cached run if exists', async () => {
    const { client, mocks } = mockSupabase();
    
    // Setup realistic channel subscription
    mockChannelSubscription(mocks);
    
    // Mock the RPC calls
    mocks.rpc.mockReturnValueOnce({
      data: {
        run: startedRunSnapshot,
        steps: [startedStepState],
      },
      error: null,
    });
    
    const pgflowClient = new PgflowClient(client);
    
    // First call should fetch from DB
    const run1 = await pgflowClient.getRun(RUN_ID);
    
    // Second call should return cached instance
    const run2 = await pgflowClient.getRun(RUN_ID);
    
    // Both calls should return same instance
    expect(run1).toBe(run2);
    
    // RPC should only be called once
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  test('getRun returns null for non-existent run', async () => {
    const { client, mocks } = mockSupabase();
    
    // Mock the RPC call to return no run
    mocks.rpc.mockReturnValueOnce({
      data: { run: null, steps: [] },
      error: null,
    });
    
    const pgflowClient = new PgflowClient(client);
    
    const result = await pgflowClient.getRun('nonexistent-id');
    
    expect(result).toBeNull();
  });

  test('emits events through callbacks', async () => {
    const { client, mocks } = mockSupabase();
    
    // Setup realistic channel subscription
    mockChannelSubscription(mocks);
    
    // Mock the getRunWithStates to return data
    mocks.rpc.mockReturnValueOnce({
      data: {
        run: startedRunSnapshot,
        steps: [startedStepState],
      },
      error: null,
    });
    
    // Create test client
    const pgflowClient = new PgflowClient(client);
    
    // Get a run to create an instance
    const run = await pgflowClient.getRun(RUN_ID);
    expect(run).not.toBeNull();
    
    // Set up event listeners to test that events are forwarded
    const runCallback = vi.fn();
    const stepCallback = vi.fn();
    
    // Register callbacks
    pgflowClient.onRunEvent(runCallback);
    pgflowClient.onStepEvent(stepCallback);
    
    // Get the broadcast handler from the mock channel
    const broadcastHandler = mocks.channel.handlers.get('*');
    expect(broadcastHandler).toBeDefined();
    
    if (broadcastHandler) {
      // Trigger a run event
      broadcastHandler({ event: 'run:completed', payload: broadcastRunCompleted });
      
      // Trigger a step event
      broadcastHandler({ event: 'step:started', payload: broadcastStepStarted });
      
      // Check callbacks were called with correct events
      expect(runCallback).toHaveBeenCalledWith(broadcastRunCompleted);
      expect(stepCallback).toHaveBeenCalledWith(broadcastStepStarted);
    }
  });

  test('dispose removes run instance and unsubscribes', async () => {
    const { client, mocks } = mockSupabase();
    
    // Setup realistic channel subscription
    mockChannelSubscription(mocks);
    
    // Mock the RPC call
    mocks.rpc.mockReturnValueOnce({
      data: {
        run: startedRunSnapshot,
        steps: [startedStepState],
      },
      error: null,
    });
    
    const pgflowClient = new PgflowClient(client);
    
    // Start a flow to create a run instance
    const run = await pgflowClient.startFlow(FLOW_SLUG, { foo: 'bar' });
    
    // Spy on run's dispose method
    const runDisposeSpy = vi.spyOn(run, 'dispose');
    
    // Dispose the run
    pgflowClient.dispose(RUN_ID);
    
    // Check that run's dispose method was called
    expect(runDisposeSpy).toHaveBeenCalled();
    
    // Check that channel was unsubscribed
    expect(mocks.channel.channel.unsubscribe).toHaveBeenCalled();
    
    // Getting the run again should require a new fetch
    mocks.rpc.mockReturnValueOnce({
      data: {
        run: startedRunSnapshot,
        steps: [startedStepState],
      },
      error: null,
    });
    
    await pgflowClient.getRun(RUN_ID);
    
    // RPC should be called again after disposal
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  test('disposeAll removes all run instances', async () => {
    const { client, mocks } = mockSupabase();
    
    // Setup realistic channel subscription
    mockChannelSubscription(mocks);
    
    // Mock the RPC calls
    mocks.rpc
      .mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, run_id: '1' },
          steps: [{ ...startedStepState, run_id: '1' }],
        },
        error: null,
      })
      .mockReturnValueOnce({
        data: {
          run: { ...startedRunSnapshot, run_id: '2' },
          steps: [{ ...startedStepState, run_id: '2' }],
        },
        error: null,
      });
    
    const pgflowClient = new PgflowClient(client);
    
    // Get two different runs
    await pgflowClient.getRun('1');
    await pgflowClient.getRun('2');
    
    // Spy on dispose method
    const disposeSpy = vi.spyOn(pgflowClient, 'dispose');
    
    // Dispose all runs
    pgflowClient.disposeAll();
    
    // dispose should be called for each run
    expect(disposeSpy).toHaveBeenCalledTimes(2);
    expect(disposeSpy).toHaveBeenCalledWith('1');
    expect(disposeSpy).toHaveBeenCalledWith('2');
  });

  test('handles step events for steps that have not been previously accessed', async () => {
    const { client, mocks } = mockSupabase();
    
    // Setup realistic channel subscription
    mockChannelSubscription(mocks);
    
    // Mock the RPC call
    mocks.rpc.mockReturnValueOnce({
      data: {
        run: startedRunSnapshot,
        steps: [],
      },
      error: null,
    });
    
    const pgflowClient = new PgflowClient(client);
    
    // Start a flow
    const run = await pgflowClient.startFlow(FLOW_SLUG, { foo: 'bar' });
    
    // Spy on the run.step method
    const stepSpy = vi.spyOn(run, 'step');
    
    // Get handler from the mock channel
    const broadcastHandler = mocks.channel.handlers.get('*');
    expect(broadcastHandler).toBeDefined();
    
    if (broadcastHandler) {
      // Event for step that has never been accessed before
      const neverAccessedStepEvent = {
        ...broadcastStepStarted,
        step_slug: 'never-accessed-step'
      };
      
      // Trigger broadcast event
      broadcastHandler({ 
        event: 'step:started', 
        payload: neverAccessedStepEvent 
      });
      
      // Verify the step was created on demand
      expect(stepSpy).toHaveBeenCalledWith('never-accessed-step');
      
      // Verify step was materialized and has correct state
      const step = run.step('never-accessed-step');
      expect(step.status).toBe(FlowStepStatus.Started);
    }
  });
});