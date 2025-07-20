import { assertEquals, assertRejects } from '@std/assert';
import { FlowWorkerLifecycle } from '../../src/flow/FlowWorkerLifecycle.ts';
import { States, TransitionError } from '../../src/core/WorkerState.ts';
import type { Queries } from '../../src/core/Queries.ts';
import type { WorkerRow } from '../../src/core/types.ts';
import type { AnyFlow } from '@pgflow/dsl';
import { createLoggingFactory } from '../../src/platform/logging.ts';
import type { Heartbeat } from '../../src/core/Heartbeat.ts';

const loggingFactory = createLoggingFactory();
loggingFactory.setLogLevel('info');
const logger = loggingFactory.createLogger('FlowWorkerLifecycle');

// Mock Heartbeat that we can control
class MockHeartbeat implements Pick<Heartbeat, 'send'> {
  public sendCallCount = 0;
  public nextResult: { is_deprecated: boolean } = { is_deprecated: false };

  async send(): Promise<{ is_deprecated: boolean }> {
    this.sendCallCount++;
    return Promise.resolve(this.nextResult);
  }
}

// Mock Queries
class MockQueries implements Pick<Queries, 'onWorkerStarted' | 'sendHeartbeat'> {
  async onWorkerStarted(params: { workerId: string; edgeFunctionName: string; queueName: string }): Promise<WorkerRow> {
    return {
      worker_id: params.workerId,
      queue_name: params.queueName,
      function_name: params.edgeFunctionName,
      started_at: new Date().toISOString(),
      deprecated_at: null,
      last_heartbeat_at: new Date().toISOString(),
    };
  }

  async sendHeartbeat(workerRow: WorkerRow): Promise<{ is_deprecated: boolean }> {
    // This shouldn't be called directly in our tests as we mock the heartbeat
    return { is_deprecated: false };
  }
}

// Mock Flow
const createMockFlow = (): AnyFlow => {
  // Return a minimal flow structure that matches AnyFlow type
  return {
    slug: 'test-flow',
  } as AnyFlow;
};

// Type guard to access private members in tests
interface FlowWorkerLifecycleWithPrivates extends FlowWorkerLifecycle {
  heartbeat?: Heartbeat;
}

Deno.test('FlowWorkerLifecycle - should transition to deprecated state when heartbeat returns is_deprecated true', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(mockQueries as unknown as Queries, mockFlow, logger);

  // Start the worker first
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(lifecycle.isRunning, true);
  assertEquals(lifecycle.isDeprecated, false);

  // Replace the heartbeat with our mock
  const mockHeartbeat = new MockHeartbeat();
  (lifecycle as unknown as FlowWorkerLifecycleWithPrivates).heartbeat = mockHeartbeat as unknown as Heartbeat;

  // First heartbeat - not deprecated
  mockHeartbeat.nextResult = { is_deprecated: false };
  await lifecycle.sendHeartbeat();
  
  assertEquals(lifecycle.isRunning, true);
  assertEquals(lifecycle.isDeprecated, false);
  assertEquals(mockHeartbeat.sendCallCount, 1);

  // Second heartbeat - deprecated
  mockHeartbeat.nextResult = { is_deprecated: true };
  await lifecycle.sendHeartbeat();
  
  assertEquals(lifecycle.isRunning, false); // Should be false now
  assertEquals(lifecycle.isDeprecated, true);
  assertEquals(mockHeartbeat.sendCallCount, 2);
});

Deno.test('FlowWorkerLifecycle - should only transition to deprecated once', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(mockQueries as unknown as Queries, mockFlow, logger);

  // Start the worker
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  // Replace the heartbeat with our mock
  const mockHeartbeat = new MockHeartbeat();
  (lifecycle as unknown as FlowWorkerLifecycleWithPrivates).heartbeat = mockHeartbeat as unknown as Heartbeat;

  // First deprecated heartbeat
  mockHeartbeat.nextResult = { is_deprecated: true };
  await lifecycle.sendHeartbeat();
  
  assertEquals(lifecycle.isDeprecated, true);

  // Second deprecated heartbeat - should not cause issues
  await lifecycle.sendHeartbeat();
  
  assertEquals(lifecycle.isDeprecated, true);
  assertEquals(mockHeartbeat.sendCallCount, 2);
});

Deno.test('FlowWorkerLifecycle - should handle missing heartbeat gracefully', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(mockQueries as unknown as Queries, mockFlow, logger);

  // Don't start the worker, so heartbeat is not initialized
  await lifecycle.sendHeartbeat(); // Should not throw
  
  assertEquals(lifecycle.isRunning, false);
  assertEquals(lifecycle.isDeprecated, false);
});

Deno.test('FlowWorkerLifecycle - deprecated state transitions', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(mockQueries as unknown as Queries, mockFlow, logger);

  // Start and deprecate the worker
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  lifecycle.transitionToDeprecated();
  assertEquals(lifecycle.isDeprecated, true);

  // Should be able to transition to stopping from deprecated
  lifecycle.transitionToStopping();
  assertEquals(lifecycle.isStopping, true);

  // Should be able to transition to stopped
  lifecycle.acknowledgeStop();
  assertEquals(lifecycle.isStopped, true);
});

Deno.test('FlowWorkerLifecycle - cannot transition to deprecated from non-running states', () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(mockQueries as unknown as Queries, mockFlow, logger);

  // Try to transition to deprecated from created state
  assertRejects(
    async () => {
      lifecycle.transitionToDeprecated();
    },
    TransitionError,
    'Cannot transition from created to deprecated'
  );
});

Deno.test('FlowWorkerLifecycle - should log appropriate message when transitioning to deprecated', async () => {
  const logs: string[] = [];
  const testLogger = {
    debug: () => {},
    info: (msg: string) => logs.push(msg),
    error: () => {},
  };

  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(
    mockQueries as unknown as Queries, 
    mockFlow, 
    testLogger as unknown as ReturnType<typeof logger>
  );

  // Start the worker
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  // Replace the heartbeat with our mock
  const mockHeartbeat = new MockHeartbeat();
  (lifecycle as unknown as FlowWorkerLifecycleWithPrivates).heartbeat = mockHeartbeat as unknown as Heartbeat;

  // Send deprecated heartbeat
  mockHeartbeat.nextResult = { is_deprecated: true };
  await lifecycle.sendHeartbeat();

  // Check that the deprecation message was logged
  const deprecationLog = logs.find(log => 
    log.includes('Worker marked for deprecation, transitioning to deprecated state')
  );
  assertEquals(deprecationLog !== undefined, true);
});

Deno.test('FlowWorkerLifecycle - queueName should return flow slug', () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(mockQueries as unknown as Queries, mockFlow, logger);

  assertEquals(lifecycle.queueName, 'test-flow');
});

Deno.test('FlowWorkerLifecycle - workerId getter should work after start', async () => {
  const mockQueries = new MockQueries();
  const mockFlow = createMockFlow();
  const lifecycle = new FlowWorkerLifecycle(mockQueries as unknown as Queries, mockFlow, logger);

  // Start the worker
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(lifecycle.workerId, 'test-worker-id');
});