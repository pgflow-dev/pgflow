import { assertSpyCalls, spy } from '@std/testing/mock';
import { assertEquals, assertRejects, assert, assertFalse } from '@std/assert';
import { WorkerLifecycle } from '../../src/WorkerLifecycle.ts';
import { Queries } from '../../src/Queries.ts';
import { Logger } from '../../src/Logger.ts';
import { WorkerBootstrap, WorkerRow } from '../../src/types.ts';

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
  const mockQueries = new Queries(null as any);

  mockQueries.onWorkerStarted = () => Promise.resolve(workerRowDouble);
  mockQueries.onWorkerStopped = () => Promise.resolve(workerRowDouble);
  mockQueries.sendHeartbeat = () => Promise.resolve();

  return mockQueries;
}

function createMockLogger() {
  const mockLogger = new Logger();

  mockLogger.log = () => {};
  mockLogger.setWorkerRow = () => {};

  return mockLogger;
}

test('acknowledgeStart - should set worker ID, edge function name and log startup', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();

  // Create spies
  const onWorkerStartedSpy = spy(mockQueries, 'onWorkerStarted');
  const loggerSetWorkerIdSpy = spy(mockLogger, 'setWorkerRow');

  const lifecycle = new WorkerLifecycle(mockQueries, mockLogger, {
    queueName: 'test-queue',
  });

  await lifecycle.acknowledgeStart(bootstrapDouble);

  assertEquals(bootstrapDouble.workerId, 'test-execution-id');
  assert(lifecycle.isRunning(), 'Worker should be running after start');
  assertSpyCalls(onWorkerStartedSpy, 1);
  assertSpyCalls(loggerSetWorkerIdSpy, 1);
});

test('sendHeartbeat - should delegate to Heartbeat instance', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();
  const lifecycle = new WorkerLifecycle(mockQueries, mockLogger, {
    queueName: 'test-queue',
  });

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
  const mockLogger = createMockLogger();
  const lifecycle = new WorkerLifecycle(mockQueries, mockLogger, {
    queueName: 'test-queue',
  });

  // Start the worker to initialize heartbeat
  await lifecycle.acknowledgeStart(bootstrapDouble);

  // Create spy after heartbeat is initialized
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  await lifecycle.sendHeartbeat();

  assertSpyCalls(heartbeatSpy, 1);
  assertEquals(heartbeatSpy.calls[0].args, [workerRowDouble]);
});

test('sendHeartbeat - should handle database errors', async () => {
  const mockQueries = new Queries(null as any);
  mockQueries.onWorkerStarted = () => Promise.resolve(workerRowDouble);
  mockQueries.sendHeartbeat = () => Promise.reject(new Error('Database error'));

  const mockLogger = createMockLogger();

  const lifecycle = new WorkerLifecycle(mockQueries, mockLogger, {
    queueName: 'test-queue',
  });
  assertFalse(
    lifecycle.isRunning(),
    'Worker should not be running before start'
  );

  await lifecycle.acknowledgeStart({
    edgeFunctionName: 'test-function',
    workerId: 'test-execution-id',
  });
  assert(lifecycle.isRunning(), 'Worker should be running after start');

  await assertRejects(
    async () => await lifecycle.sendHeartbeat(),
    Error,
    'Database error'
  );
});

test('sendHeartbeat - should do nothing if heartbeat not initialized', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  const lifecycle = new WorkerLifecycle(mockQueries, mockLogger, {
    queueName: 'test-queue',
  });
  // Note: Not calling acknowledgeStart()
  assertFalse(
    lifecycle.isRunning(),
    'Worker should not be running before start'
  );

  await lifecycle.sendHeartbeat();

  assertSpyCalls(heartbeatSpy, 0);
});

test('acknowledgeStop - should mark worker as stopped and log completion', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();
  mockLogger.log = () => {};
  mockLogger.setWorkerRow = () => {};
  const onWorkerStoppedSpy = spy(mockQueries, 'onWorkerStopped');
  const lifecycle = new WorkerLifecycle(mockQueries, mockLogger, {
    queueName: 'test-queue',
  });
  await lifecycle.acknowledgeStart(bootstrapDouble);

  assert(lifecycle.isRunning(), 'Worker should be running before stop');
  await lifecycle.acknowledgeStop();
  assertFalse(lifecycle.isRunning(), 'Worker should not be running after stop');

  assertSpyCalls(onWorkerStoppedSpy, 1);
});

test('acknowledgeStop - should propagate database errors and log failure', async () => {
  const mockQueries = new Queries(null as any);
  mockQueries.onWorkerStarted = () => Promise.resolve(workerRowDouble);
  mockQueries.onWorkerStopped = () =>
    Promise.reject(new Error('Database error'));
  mockQueries.sendHeartbeat = () => Promise.resolve();

  const mockLogger = new Logger();
  mockLogger.log = () => {};
  mockLogger.setWorkerRow = () => {};

  const lifecycle = new WorkerLifecycle(mockQueries, mockLogger, {
    queueName: 'test-queue',
  });
  await lifecycle.acknowledgeStart(bootstrapDouble);

  // Test error handling
  await assertRejects(
    async () => await lifecycle.acknowledgeStop(),
    Error,
    'Database error'
  );
});
