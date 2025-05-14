import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseBroadcastAdapter } from '../src/lib/SupabaseBroadcastAdapter';
import { 
  RUN_ID, 
  FLOW_SLUG, 
  STEP_SLUG,
  broadcastRunStarted, 
  broadcastStepStarted,
  startedRunSnapshot,
  startedStepState
} from './fixtures';
import { mockSupabase, resetMocks } from './mocks';

describe('SupabaseBroadcastAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMocks();
  });

  test('initializes correctly', () => {
    const { client } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    expect(adapter).toBeDefined();
  });

  test('subscribes to run events with correct channel name', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    adapter.subscribeToRun(RUN_ID);
    
    expect(client.channel).toHaveBeenCalledWith(`pgflow:run:${RUN_ID}`);
    expect(mocks.channel.channel.subscribe).toHaveBeenCalled();
  });

  test('registers handlers for broadcast events', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    adapter.subscribeToRun(RUN_ID);
    
    expect(mocks.channel.channel.on).toHaveBeenCalledWith(
      'broadcast', 
      { event: '*' }, 
      expect.any(Function)
    );
  });

  test('routes run events correctly', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Set up an event listener
    const runEventCallback = vi.fn();
    adapter.onRunEvent(runEventCallback);
    
    // Subscribe to run
    adapter.subscribeToRun(RUN_ID);
    
    // Get the broadcast handler
    const broadcastHandler = mocks.channel.handlers.get('*');
    expect(broadcastHandler).toBeDefined();
    
    // Simulate a run event
    broadcastHandler?.({ 
      event: 'run:started', 
      payload: broadcastRunStarted 
    });
    
    // The run event callback should be called
    expect(runEventCallback).toHaveBeenCalledWith(broadcastRunStarted);
  });

  test('routes step events correctly', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Set up an event listener
    const stepEventCallback = vi.fn();
    adapter.onStepEvent(stepEventCallback);
    
    // Subscribe to run
    adapter.subscribeToRun(RUN_ID);
    
    // Get the broadcast handler
    const broadcastHandler = mocks.channel.handlers.get('*');
    expect(broadcastHandler).toBeDefined();
    
    // Simulate a step event
    broadcastHandler?.({ 
      event: 'step:started', 
      payload: broadcastStepStarted 
    });
    
    // The step event callback should be called
    expect(stepEventCallback).toHaveBeenCalledWith(broadcastStepStarted);
  });

  test('unsubscribes correctly', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Subscribe and then unsubscribe
    adapter.subscribeToRun(RUN_ID);
    adapter.unsubscribe(RUN_ID);
    
    expect(mocks.channel.channel.unsubscribe).toHaveBeenCalled();
  });

  test('handles channel error and reconnection', async () => {
    const { client, mocks } = mockSupabase();
    
    // Mock getRunWithStates to return valid data
    mocks.rpc.mockImplementation((funcName, args) => {
      if (funcName === 'get_run_with_states' && args.run_id === RUN_ID) {
        return Promise.resolve({
          data: {
            run: startedRunSnapshot,
            steps: [startedStepState],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Set up event listeners
    const runEventCallback = vi.fn();
    const stepEventCallback = vi.fn();
    adapter.onRunEvent(runEventCallback);
    adapter.onStepEvent(stepEventCallback);
    
    // Subscribe to run
    adapter.subscribeToRun(RUN_ID);
    
    // Get the system error handler
    const errorHandler = mocks.channel.systemHandlers.get('error');
    expect(errorHandler).toBeDefined();
    
    // Simulate a channel error
    errorHandler?.({ error: 'connection lost' });
    
    // Fast forward past the reconnection delay
    vi.advanceTimersByTime(2001);
    
    // Wait for promises to resolve
    await vi.runAllTimersAsync();
    
    // Check that getRunWithStates was called
    expect(mocks.rpc).toHaveBeenCalledWith('get_run_with_states', { run_id: RUN_ID });
    
    // Check that events were emitted from the snapshot
    expect(runEventCallback).toHaveBeenCalledWith(expect.objectContaining({
      run_id: RUN_ID,
      status: 'started',
    }));
    
    expect(stepEventCallback).toHaveBeenCalledWith(expect.objectContaining({
      run_id: RUN_ID,
      step_slug: STEP_SLUG,
      status: 'started',
    }));
    
    // Check that a new channel was created
    expect(client.channel).toHaveBeenCalledTimes(2);
  });

  test('fetchFlowDefinition returns flow and steps', async () => {
    const { client, mocks } = mockSupabase();
    
    // Mock the database queries
    const flowData = { flow_slug: FLOW_SLUG, version: '1.0.0' };
    const stepsData = [{ flow_slug: FLOW_SLUG, step_slug: STEP_SLUG, step_index: 0 }];
    
    // Mock flow query response
    mocks.queryBuilder.single.mockReturnValueOnce({ 
      data: flowData, 
      error: null 
    });
    
    // Set up mock for the steps query
    mocks.queryBuilder.execute.mockReturnValueOnce({
      data: stepsData,
      error: null
    });
    
    const adapter = new SupabaseBroadcastAdapter(client);
    
    const result = await adapter.fetchFlowDefinition(FLOW_SLUG);
    
    // Simplify the test to just check the correct data is processed
    expect(result).toHaveProperty('flow', flowData);
    expect(result).toHaveProperty('steps');
    
    // Verify schema was called
    expect(mocks.schema).toHaveBeenCalled();
  });

  test('getRunWithStates fetches current state', async () => {
    const { client, mocks } = mockSupabase();
    
    // Mock the RPC response
    const rpcResponse = {
      run: startedRunSnapshot,
      steps: [startedStepState],
    };
    
    mocks.rpc.mockReturnValueOnce({ 
      data: rpcResponse,
      error: null 
    });
    
    const adapter = new SupabaseBroadcastAdapter(client);
    
    const result = await adapter.getRunWithStates(RUN_ID);
    
    expect(result).toEqual(rpcResponse);
    expect(mocks.rpc).toHaveBeenCalledWith('get_run_with_states', { run_id: RUN_ID });
  });
});