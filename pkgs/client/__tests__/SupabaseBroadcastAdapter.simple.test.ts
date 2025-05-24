import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseBroadcastAdapter } from '../src/lib/SupabaseBroadcastAdapter';
import { 
  RUN_ID, 
  FLOW_SLUG, 
  STEP_SLUG,
  startedRunSnapshot,
  startedStepState
} from './fixtures';
import { mockSupabase } from './mocks';

/**
 * This is a simplified test that focuses on the core functionality
 * without getting tied to implementation details or timer complexity.
 */
describe('SupabaseBroadcastAdapter - Simple Tests', () => {
  beforeEach(() => {
    // Silence console logs/errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper to create a synchronous scheduler for immediate execution
   */
  function createImmediateScheduler() {
    return (fn: Function) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    };
  }

  /**
   * Test basic connection functionality using the public interface
   */
  test('subscribes to a run and configures channel correctly', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Subscribe to run
    adapter.subscribeToRun(RUN_ID);
    
    // Check channel was created with correct name
    expect(client.channel).toHaveBeenCalledWith(`pgflow:run:${RUN_ID}`);
    
    // Check channel was subscribed
    expect(mocks.channel.channel.subscribe).toHaveBeenCalled();
    
    // Check handlers were registered (2-argument form)
    expect(mocks.channel.channel.on).toHaveBeenCalledWith(
      'broadcast', 
      expect.any(Function)
    );
    
    // Check error handler was registered
    expect(mocks.channel.channel.on).toHaveBeenCalledWith(
      'system', 
      { event: 'error' }, 
      expect.any(Function)
    );
  });

  /**
   * Test that event callbacks are invoked properly
   */
  test('properly routes events to registered callbacks', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Set up event listeners
    const runSpy = vi.fn();
    const stepSpy = vi.fn();
    adapter.onRunEvent(runSpy);
    adapter.onStepEvent(stepSpy);
    
    // Subscribe to run
    adapter.subscribeToRun(RUN_ID);
    
    // Get the broadcast handler registered for '*'
    const broadcastHandler = mocks.channel.handlers.get('*');
    expect(broadcastHandler).toBeDefined();
    
    // Simulate a run event via the handler
    broadcastHandler?.({
      event: 'run:started',
      payload: { 
        event_type: 'run:started',
        run_id: RUN_ID,
        flow_slug: FLOW_SLUG,
        status: 'started'
      }
    });
    
    // Check that the run event callback was called
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'run:started',
        run_id: RUN_ID
      })
    );
    
    // Simulate a step event via the handler
    broadcastHandler?.({
      event: 'step:started',
      payload: {
        event_type: 'step:started',
        run_id: RUN_ID,
        step_slug: STEP_SLUG,
        status: 'started'
      }
    });
    
    // Check that the step event callback was called
    expect(stepSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'step:started',
        step_slug: STEP_SLUG
      })
    );
  });

  /**
   * Test that RPC works correctly for fetching data
   */
  test('getRunWithStates calls RPC with correct parameters', async () => {
    const { client, mocks } = mockSupabase();
    
    // Mock RPC response
    mocks.rpc.mockResolvedValueOnce({
      data: { 
        run: startedRunSnapshot, 
        steps: [startedStepState] 
      },
      error: null
    });
    
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Call method directly
    const result = await adapter.getRunWithStates(RUN_ID);
    
    // Verify RPC was called correctly
    expect(mocks.schema).toHaveBeenCalledWith('pgflow');
    expect(mocks.rpc).toHaveBeenCalledWith('get_run_with_states', { run_id: RUN_ID });
    
    // Verify result
    expect(result).toEqual({
      run: startedRunSnapshot,
      steps: [startedStepState]
    });
  });

  /**
   * Test behavior during properly initiated unsubscribe
   */
  test('properly cleans up on unsubscribe', () => {
    const { client, mocks } = mockSupabase();
    const adapter = new SupabaseBroadcastAdapter(client);
    
    // Subscribe then unsubscribe
    adapter.subscribeToRun(RUN_ID);
    adapter.unsubscribe(RUN_ID);
    
    // Check channel was unsubscribed
    expect(mocks.channel.channel.unsubscribe).toHaveBeenCalled();
  });
});