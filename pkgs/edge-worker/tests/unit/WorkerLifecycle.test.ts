import { assertSpyCalls, spy } from '@std/testing/mock';
import {
  assertEquals,
  assertRejects,
  assert,
  assertFalse,
  assertThrows,
} from '@std/assert';
import { WorkerLifecycle } from '../../src/WorkerLifecycle.ts';
import { Queries } from '../../src/Queries.ts';
import type { WorkerBootstrap, WorkerRow } from '../../src/types.ts';
import { Queue } from '../../src/Queue.ts';

// @ts-ignore TODO: fix types
const test = Deno.test;

const bootstrapDouble: WorkerBootstrap = {
  edgeFunctionName: 'test-function',
  workerId: 'test-execution-id',
};

const workerRowDouble: WorkerRow = {
  worker_id: 'test-execution-id',
  queue_name: 'test-queue',
  started_at: new Date().toISOString(),
  stopped_at: null,
  last_heartbeat_at: new Date().toISOString(),
  function_name: 'test-function',
};

function createMockQueries() {
  // deno-lint-ignore no-explicit-any
  const mockQueries = new Queries(null as any);

  mockQueries.onWorkerStarted = () => Promise.resolve(workerRowDouble);
  mockQueries.onWorkerStopped = () => Promise.resolve(workerRowDouble);
  mockQueries.sendHeartbeat = () => Promise.resolve();

  return mockQueries;
}

function createMockQueue() {
  // deno-lint-ignore no-explicit-any
  return new Queue(null as any, null as any);
}

test('acknowledgeStart - should set worker ID, edge function name', async () => {
  const mockQueries = createMockQueries();
  const mockQueue = createMockQueue();

  // Create spies
  const onWorkerStartedSpy = spy(mockQueries, 'onWorkerStarted');

  const lifecycle = new WorkerLifecycle(mockQueries, mockQueue);

  await lifecycle.acknowledgeStart(bootstrapDouble);

  assertEquals(bootstrapDouble.workerId, 'test-execution-id');
  assert(lifecycle.isRunning, 'Worker should be running after start');
  assertSpyCalls(onWorkerStartedSpy, 1);
});

test('sendHeartbeat - should delegate to Heartbeat instance', async () => {
  const mockQueries = createMockQueries();
  const mockQueue = createMockQueue();
  const lifecycle = new WorkerLifecycle(mockQueries, mockQueue);

  // Start the worker to initialize heartbeat
  await lifecycle.acknowledgeStart(bootstrapDouble);

  // Create spy after heartbeat is initialized
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  await lifecycle.sendHeartbeat();

  assertSpyCalls(heartbeatSpy, 1);
  assertEquals(heartbeatSpy.calls[0].args, [workerRowDouble]);
});

test('sendHeartbeat - should work after initialization', async () => {
  const mockQueries = createMockQueries();
  const mockQueue = createMockQueue();
  const lifecycle = new WorkerLifecycle(mockQueries, mockQueue);

  // Start the worker to initialize heartbeat
  await lifecycle.acknowledgeStart(bootstrapDouble);

  // Create spy after heartbeat is initialized
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  await lifecycle.sendHeartbeat();

  assertSpyCalls(heartbeatSpy, 1);
  assertEquals(heartbeatSpy.calls[0].args, [workerRowDouble]);
});

test('sendHeartbeat - should handle database errors', async () => {
  const mockQueries = createMockQueries();
  const mockQueue = createMockQueue();
  mockQueries.onWorkerStarted = () => Promise.resolve(workerRowDouble);
  mockQueries.sendHeartbeat = () => Promise.reject(new Error('Database error'));

  const lifecycle = new WorkerLifecycle(mockQueries, mockQueue);
  assertFalse(
    lifecycle.isRunning,
    'Worker should not be running before start'
  );

  await lifecycle.acknowledgeStart({
    edgeFunctionName: 'test-function',
    workerId: 'test-execution-id',
  });
  assert(lifecycle.isRunning, 'Worker should be running after start');

  await assertRejects(
    async () => await lifecycle.sendHeartbeat(),
    Error,
    'Database error'
  );
});

test('sendHeartbeat - should do nothing if heartbeat not initialized', async () => {
  const mockQueries = createMockQueries();
  const mockQueue = createMockQueue();
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  const lifecycle = new WorkerLifecycle(mockQueries, mockQueue);
  // Note: Not calling acknowledgeStart()
  assertFalse(
    lifecycle.isRunning,
    'Worker should not be running before start'
  );

  await lifecycle.sendHeartbeat();

  assertSpyCalls(heartbeatSpy, 0);
});

test({
  name: 'acknowledgeStop - should mark worker as stopped',
  ignore: true,
  fn: async () => {
    const mockQueries = createMockQueries();
    const mockQueue = createMockQueue();
    const onWorkerStoppedSpy = spy(mockQueries, 'onWorkerStopped');
    const lifecycle = new WorkerLifecycle(mockQueries, mockQueue);
    await lifecycle.acknowledgeStart(bootstrapDouble);

    assert(lifecycle.isRunning, 'Worker should be running before stop');
    lifecycle.acknowledgeStop();
    assertFalse(
      lifecycle.isRunning,
      'Worker should not be running after stop'
    );

    assertSpyCalls(onWorkerStoppedSpy, 1);
  },
});

test({
  name: 'acknowledgeStop - should propagate database errors',
  ignore: true,
  fn: async () => {
    const mockQueries = createMockQueries();
    const mockQueue = createMockQueue();
    mockQueries.onWorkerStarted = () => Promise.resolve(workerRowDouble);
    mockQueries.onWorkerStopped = () =>
      Promise.reject(new Error('Database error'));
    mockQueries.sendHeartbeat = () => Promise.resolve();

    const lifecycle = new WorkerLifecycle(mockQueries, mockQueue);
    await lifecycle.acknowledgeStart(bootstrapDouble);

    // Test error handling
    assertThrows(() => lifecycle.acknowledgeStop(), Error, 'Database error');
  },
});
