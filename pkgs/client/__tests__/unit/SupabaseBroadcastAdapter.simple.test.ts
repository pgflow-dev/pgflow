import { describe, test, expect, vi } from 'vitest';
import { SupabaseBroadcastAdapter } from '../../src/lib/SupabaseBroadcastAdapter';
import {
  setupTestEnvironment,
  createMockClient,
  emitBroadcastEvent,
} from '../helpers/test-utils';
import {
  createRunStartedEvent,
  createStepStartedEvent,
} from '../helpers/event-factories';
import {
  RUN_ID,
  FLOW_SLUG,
  STEP_SLUG,
  startedRunSnapshot,
  startedStepState,
} from '../fixtures';
import { mockChannelSubscription } from '../mocks';

/**
 * This is a simplified test that focuses on the core functionality
 * without getting tied to implementation details or timer complexity.
 */
describe('SupabaseBroadcastAdapter - Simple Tests', () => {
  setupTestEnvironment();
  
  beforeEach(() => {
    // Silence console logs/errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => { /* intentionally empty */ });
    vi.spyOn(console, 'log').mockImplementation(() => { /* intentionally empty */ });
  });


  /**
   * Test basic connection functionality using the public interface
   */
  test('subscribes to a run and configures channel correctly', async () => {
    const { client, mocks } = createMockClient();
    const adapter = new SupabaseBroadcastAdapter(client, { stabilizationDelayMs: 0 });

    // Setup realistic channel subscription
    mockChannelSubscription(mocks);

    // Subscribe to run (need to advance timers for setTimeout(..., 0))
    const subscribePromise = adapter.subscribeToRun(RUN_ID);
    await vi.runAllTimersAsync();
    await subscribePromise;

    // Check channel was created with correct name
    expect(client.channel).toHaveBeenCalledWith(`pgflow:run:${RUN_ID}`);

    // Check channel was subscribed
    expect(mocks.channel.channel.subscribe).toHaveBeenCalled();

    // Check handlers were registered (3-argument form)
    expect(mocks.channel.channel.on).toHaveBeenCalledWith(
      'broadcast',
      { event: '*' },
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
    const { client, mocks } = createMockClient();
    const adapter = new SupabaseBroadcastAdapter(client, { stabilizationDelayMs: 0 });

    // Set up event listeners
    const runSpy = vi.fn();
    const stepSpy = vi.fn();
    adapter.onRunEvent(runSpy);
    adapter.onStepEvent(stepSpy);

    // Subscribe to run
    adapter.subscribeToRun(RUN_ID);

    // Simulate a run event
    const runStartedEvent = createRunStartedEvent({ run_id: RUN_ID });
    emitBroadcastEvent(mocks, 'run:started', runStartedEvent);

    // Check that the run event callback was called
    expect(runSpy).toHaveBeenCalledWith(runStartedEvent);

    // Simulate a step event
    const stepStartedEvent = createStepStartedEvent({ run_id: RUN_ID, step_slug: STEP_SLUG });
    emitBroadcastEvent(mocks, 'step:started', stepStartedEvent);

    // Check that the step event callback was called
    expect(stepSpy).toHaveBeenCalledWith(stepStartedEvent);
  });

  /**
   * Test that RPC works correctly for fetching data
   */
  test('getRunWithStates calls RPC with correct parameters', async () => {
    const { client, mocks } = createMockClient();

    // Mock RPC response
    mocks.rpc.mockResolvedValueOnce({
      data: {
        run: startedRunSnapshot,
        steps: [startedStepState],
      },
      error: null,
    });

    const adapter = new SupabaseBroadcastAdapter(client, { stabilizationDelayMs: 0 });

    // Call method directly
    const result = await adapter.getRunWithStates(RUN_ID);

    // Verify RPC was called correctly
    expect(mocks.schema).toHaveBeenCalledWith('pgflow');
    expect(mocks.rpc).toHaveBeenCalledWith('get_run_with_states', {
      run_id: RUN_ID,
    });

    // Verify result
    expect(result).toEqual({
      run: startedRunSnapshot,
      steps: [startedStepState],
    });
  });

  /**
   * Test behavior during properly initiated unsubscribe
   */
  test('properly cleans up on unsubscribe', async () => {
    const { client, mocks } = createMockClient();
    const adapter = new SupabaseBroadcastAdapter(client, { stabilizationDelayMs: 0 });

    // Setup realistic channel subscription
    mockChannelSubscription(mocks);

    // Subscribe then unsubscribe (need to advance timers for setTimeout(..., 0))
    const subscribePromise = adapter.subscribeToRun(RUN_ID);
    await vi.runAllTimersAsync();
    await subscribePromise;
    adapter.unsubscribe(RUN_ID);

    // Check channel was unsubscribed
    expect(mocks.channel.channel.unsubscribe).toHaveBeenCalled();
  });
});
