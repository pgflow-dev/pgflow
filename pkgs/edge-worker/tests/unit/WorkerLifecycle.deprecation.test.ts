import { assertEquals, assertRejects } from '@std/assert';
import { WorkerLifecycle } from '../../src/core/WorkerLifecycle.ts';
import { States, TransitionError } from '../../src/core/WorkerState.ts';
import type { Queries } from '../../src/core/Queries.ts';
import type { Queue } from '../../src/queue/Queue.ts';
import type { WorkerRow, Json } from '../../src/core/types.ts';
import { createLoggingFactory } from '../../src/platform/logging.ts';

const loggingFactory = createLoggingFactory();
loggingFactory.setLogLevel('info');
const logger = loggingFactory.createLogger('WorkerLifecycle');

// Mock Heartbeat that we can control
class MockHeartbeat {
  public sendCallCount = 0;
  public nextResult: { is_deprecated: boolean } = { is_deprecated: false };

  async send(): Promise<{ is_deprecated: boolean }> {
    this.sendCallCount++;
    return Promise.resolve(this.nextResult);
  }
}

// Mock Queries
class MockQueries implements Pick<Queries, 'onWorkerStarted' | 'sendHeartbeat'> {
  async onWorkerStarted(params: any): Promise<WorkerRow> {
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

// Mock Queue
class MockQueue<T extends Json> implements Pick<Queue<T>, 'queueName' | 'safeCreate'> {
  constructor(public queueName: string) {}
  
  async safeCreate() {
    // Return empty array to match the expected type
    return [] as any;
  }
}

Deno.test('WorkerLifecycle - should transition to deprecated state when heartbeat returns is_deprecated true', async () => {
  const mockQueries = new MockQueries();
  const mockQueue = new MockQueue('test-queue');
  const lifecycle = new WorkerLifecycle(mockQueries as any, mockQueue as any, logger);

  // Start the worker first
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  assertEquals(lifecycle.isRunning, true);
  assertEquals(lifecycle.isDeprecated, false);

  // Replace the heartbeat with our mock
  const mockHeartbeat = new MockHeartbeat();
  (lifecycle as any).heartbeat = mockHeartbeat;

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

Deno.test('WorkerLifecycle - should only transition to deprecated once', async () => {
  const mockQueries = new MockQueries();
  const mockQueue = new MockQueue('test-queue');
  const lifecycle = new WorkerLifecycle(mockQueries as any, mockQueue as any, logger);

  // Start the worker
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  // Replace the heartbeat with our mock
  const mockHeartbeat = new MockHeartbeat();
  (lifecycle as any).heartbeat = mockHeartbeat;

  // First deprecated heartbeat
  mockHeartbeat.nextResult = { is_deprecated: true };
  await lifecycle.sendHeartbeat();
  
  assertEquals(lifecycle.isDeprecated, true);

  // Second deprecated heartbeat - should not cause issues
  await lifecycle.sendHeartbeat();
  
  assertEquals(lifecycle.isDeprecated, true);
  assertEquals(mockHeartbeat.sendCallCount, 2);
});

Deno.test('WorkerLifecycle - should handle missing heartbeat gracefully', async () => {
  const mockQueries = new MockQueries();
  const mockQueue = new MockQueue('test-queue');
  const lifecycle = new WorkerLifecycle(mockQueries as any, mockQueue as any, logger);

  // Don't start the worker, so heartbeat is not initialized
  await lifecycle.sendHeartbeat(); // Should not throw
  
  assertEquals(lifecycle.isRunning, false);
  assertEquals(lifecycle.isDeprecated, false);
});

Deno.test('WorkerLifecycle - deprecated state transitions', async () => {
  const mockQueries = new MockQueries();
  const mockQueue = new MockQueue('test-queue');
  const lifecycle = new WorkerLifecycle(mockQueries as any, mockQueue as any, logger);

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

Deno.test('WorkerLifecycle - cannot transition to deprecated from non-running states', () => {
  const mockQueries = new MockQueries();
  const mockQueue = new MockQueue('test-queue');
  const lifecycle = new WorkerLifecycle(mockQueries as any, mockQueue as any, logger);

  // Try to transition to deprecated from created state
  assertRejects(
    async () => {
      lifecycle.transitionToDeprecated();
    },
    TransitionError,
    'Cannot transition from created to deprecated'
  );
});

Deno.test('WorkerLifecycle - should log appropriate message when transitioning to deprecated', async () => {
  const logs: string[] = [];
  const testLogger = {
    debug: () => {},
    info: (msg: string) => logs.push(msg),
    error: () => {},
  };

  const mockQueries = new MockQueries();
  const mockQueue = new MockQueue('test-queue');
  const lifecycle = new WorkerLifecycle(mockQueries as any, mockQueue as any, testLogger as any);

  // Start the worker
  await lifecycle.acknowledgeStart({
    workerId: 'test-worker-id',
    edgeFunctionName: 'test-function',
  });

  // Replace the heartbeat with our mock
  const mockHeartbeat = new MockHeartbeat();
  (lifecycle as any).heartbeat = mockHeartbeat;

  // Send deprecated heartbeat
  mockHeartbeat.nextResult = { is_deprecated: true };
  await lifecycle.sendHeartbeat();

  // Check that the deprecation message was logged
  const deprecationLog = logs.find(log => 
    log.includes('Worker marked for deprecation, transitioning to deprecated state')
  );
  assertEquals(deprecationLog !== undefined, true);
});