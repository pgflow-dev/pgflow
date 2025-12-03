import { describe, test, expect, vi } from 'vitest';
import { PgflowClient } from '../../src/lib/PgflowClient';
import { FlowRunStatus, FlowStepStatus } from '../../src/lib/types';
import {
  setupTestEnvironment,
  createMockClient,
  createRunResponse,
  mockRpcCall,
  emitBroadcastEvent,
  createSyncSchedule,
} from '../helpers/test-utils';
import {
  createRunCompletedEvent,
  createStepStartedEvent,
} from '../helpers/event-factories';
import { RUN_ID, FLOW_SLUG } from '../fixtures';

// Mock uuid.v4 to return a predictable run ID for testing
vi.mock('uuid', () => ({
  v4: () => RUN_ID,
}));

describe('PgflowClient', () => {
  setupTestEnvironment();

  test('initializes correctly', () => {
    const { client } = createMockClient();
    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

    expect(pgflowClient).toBeDefined();
  });

  test('startFlow calls RPC with correct parameters and returns run', async () => {
    const { client, mocks } = createMockClient();
    const input = { foo: 'bar' };
    
    // Mock the RPC response
    const response = createRunResponse(
      { run_id: RUN_ID, flow_slug: FLOW_SLUG, input },
      [{ step_slug: 'test-step' }]
    );
    mockRpcCall(mocks, response);

    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });
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
    const { client, mocks } = createMockClient();

    // Mock the RPC call to return an error
    const error = new Error('RPC error');
    mockRpcCall(mocks, { data: null, error });

    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

    // The startFlow call should reject with the error
    await expect(
      pgflowClient.startFlow(FLOW_SLUG, { foo: 'bar' })
    ).rejects.toThrow(error);
  });

  test('getRun returns cached run if exists', async () => {
    const { client, mocks } = createMockClient();

    // Mock the RPC response
    const response = createRunResponse(
      { run_id: RUN_ID },
      [{ step_slug: 'test-step' }]
    );
    mockRpcCall(mocks, response);

    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

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
    const { client, mocks } = createMockClient();

    // Mock the RPC call to return no run
    mockRpcCall(mocks, { data: { run: null, steps: [] }, error: null });

    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

    const result = await pgflowClient.getRun('nonexistent-id');

    expect(result).toBeNull();
  });

  test('emits events through callbacks', async () => {
    const { client, mocks } = createMockClient();

    // Mock the getRunWithStates to return data
    const response = createRunResponse({ run_id: RUN_ID });
    mockRpcCall(mocks, response);

    // Create test client
    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

    // Get a run to create an instance
    const run = await pgflowClient.getRun(RUN_ID);
    expect(run).not.toBeNull();

    // Set up event listeners to test that events are forwarded
    const runCallback = vi.fn();
    const stepCallback = vi.fn();

    // Register callbacks
    pgflowClient.onRunEvent(runCallback);
    pgflowClient.onStepEvent(stepCallback);

    // Trigger events
    const runCompletedEvent = createRunCompletedEvent({ run_id: RUN_ID });
    const stepStartedEvent = createStepStartedEvent({ run_id: RUN_ID });
    
    emitBroadcastEvent(mocks, 'run:completed', runCompletedEvent);
    emitBroadcastEvent(mocks, 'step:started', stepStartedEvent);

    // Check callbacks were called with correct events
    expect(runCallback).toHaveBeenCalledWith(runCompletedEvent);
    expect(stepCallback).toHaveBeenCalledWith(stepStartedEvent);
  });

  test('dispose removes run instance and unsubscribes', async () => {
    const { client, mocks } = createMockClient();
    const input = { foo: 'bar' };

    // Mock the RPC response
    const response = createRunResponse({ run_id: RUN_ID, input });
    mockRpcCall(mocks, response);

    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

    // Start a flow to create a run instance
    const run = await pgflowClient.startFlow(FLOW_SLUG, input);

    // Spy on run's dispose method
    const runDisposeSpy = vi.spyOn(run, 'dispose');

    // Dispose the run
    pgflowClient.dispose(RUN_ID);

    // Check that run's dispose method was called
    expect(runDisposeSpy).toHaveBeenCalled();

    // Check that channel was unsubscribed
    expect(mocks.channel.channel.unsubscribe).toHaveBeenCalled();

    // Getting the run again should require a new fetch
    mockRpcCall(mocks, response);
    await pgflowClient.getRun(RUN_ID);

    // RPC should be called again after disposal
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  test('disposeAll removes all run instances', async () => {
    const { client, mocks } = createMockClient();

    // Mock responses for two different runs
    const response1 = createRunResponse({ run_id: '1' }, [{ step_slug: 'step-1' }]);
    const response2 = createRunResponse({ run_id: '2' }, [{ step_slug: 'step-2' }]);
    
    mockRpcCall(mocks, response1);
    mockRpcCall(mocks, response2);

    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

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
    const { client, mocks } = createMockClient();
    const input = { foo: 'bar' };

    // Mock the RPC response with no steps
    const response = createRunResponse({ run_id: RUN_ID, input }, []);
    mockRpcCall(mocks, response);

    const pgflowClient = new PgflowClient(client, { realtimeStabilizationDelayMs: 0, schedule: createSyncSchedule() });

    // Start a flow
    const run = await pgflowClient.startFlow(FLOW_SLUG, input);

    // Spy on the run.step method
    const stepSpy = vi.spyOn(run, 'step');

    // Event for step that has never been accessed before
    const neverAccessedStepEvent = createStepStartedEvent({
      run_id: RUN_ID,
      step_slug: 'never-accessed-step',
    });

    // Trigger broadcast event
    emitBroadcastEvent(mocks, 'step:started', neverAccessedStepEvent);

    // Verify the step was created on demand
    expect(stepSpy).toHaveBeenCalledWith('never-accessed-step');

    // Verify step was materialized and has correct state
    const step = run.step('never-accessed-step');
    expect(step.status).toBe(FlowStepStatus.Started);
  });
});
