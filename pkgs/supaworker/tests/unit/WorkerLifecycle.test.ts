import { assertSpyCalls, spy } from '@std/testing/mock';
import { assertEquals, assertRejects, assert, assertFalse } from '@std/assert';
import { WorkerLifecycle } from '../../src/WorkerLifecycle.ts';
import { Queries } from '../../src/Queries.ts';
import { Logger } from '../../src/Logger.ts';

// @ts-ignore TODO: fix types
const test = Deno.test;

const mockWorkerRow = {
  worker_id: 'test-worker-id',
  queue_name: 'test-queue',
  started_at: new Date().toISOString(),
  stopped_at: null,
  last_heartbeat_at: new Date().toISOString(),
  current_function: null,
};

function createMockQueries() {
  const mockQueries = new Queries(null as any);

  mockQueries.onWorkerStarted = () => Promise.resolve(mockWorkerRow);
  mockQueries.onWorkerStopped = () => Promise.resolve(mockWorkerRow);
  mockQueries.sendHeartbeat = () => Promise.resolve();

  return mockQueries;
}

function createMockLogger() {
  const mockLogger = new Logger();

  mockLogger.log = () => {};
  mockLogger.setWorkerId = () => {};

  return mockLogger;
}

test('acknowledgeStart - should set worker ID and log startup', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();

  // Create spies
  const onWorkerStartedSpy = spy(mockQueries, 'onWorkerStarted');
  const loggerSetWorkerIdSpy = spy(mockLogger, 'setWorkerId');
  const loggerLogSpy = spy(mockLogger, 'log');

  const lifecycle = new WorkerLifecycle('test-queue', mockQueries, mockLogger);

  const workerId = await lifecycle.acknowledgeStart();

  assertEquals(workerId, 'test-worker-id');
  assert(lifecycle.isRunning(), 'Worker should be running after start');
  assertSpyCalls(onWorkerStartedSpy, 1);
  assertSpyCalls(loggerSetWorkerIdSpy, 1);
  assertSpyCalls(loggerLogSpy, 1);
});

test('sendHeartbeat - should delegate to Heartbeat instance with edge function name', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();
  const lifecycle = new WorkerLifecycle('test-queue', mockQueries, mockLogger);

  // Start the worker to initialize heartbeat
  await lifecycle.acknowledgeStart();

  // Create spy after heartbeat is initialized
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  await lifecycle.sendHeartbeat('test-function');

  assertSpyCalls(heartbeatSpy, 1);
  assertEquals(heartbeatSpy.calls[0].args, ['test-worker-id', 'test-function']);
});

test('sendHeartbeat - should work without edge function name', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();
  const lifecycle = new WorkerLifecycle('test-queue', mockQueries, mockLogger);

  // Start the worker to initialize heartbeat
  await lifecycle.acknowledgeStart();

  // Create spy after heartbeat is initialized
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  await lifecycle.sendHeartbeat();

  assertSpyCalls(heartbeatSpy, 1);
  assertEquals(heartbeatSpy.calls[0].args, ['test-worker-id', undefined]);
});

test('sendHeartbeat - should handle database errors', async () => {
  const mockQueries = new Queries(null as any);
  mockQueries.onWorkerStarted = () => Promise.resolve(mockWorkerRow);
  mockQueries.sendHeartbeat = () => Promise.reject(new Error('Database error'));

  const mockLogger = createMockLogger();
  const loggerLogSpy = spy(mockLogger, 'log');

  const lifecycle = new WorkerLifecycle('test-queue', mockQueries, mockLogger);
  assertFalse(
    lifecycle.isRunning(),
    'Worker should not be running before start'
  );

  await lifecycle.acknowledgeStart();
  assert(lifecycle.isRunning(), 'Worker should be running after start');

  await assertRejects(
    async () => await lifecycle.sendHeartbeat('test-function'),
    Error,
    'Database error'
  );

  // Should log:
  // 1. "Worker started" from acknowledgeStart
  // 2. "Sending heartbeat..." from Heartbeat.send
  assertSpyCalls(loggerLogSpy, 1);
  assertEquals(loggerLogSpy.calls[0].args[0], 'Worker started');
});

test('sendHeartbeat - should do nothing if heartbeat not initialized', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();
  const heartbeatSpy = spy(mockQueries, 'sendHeartbeat');

  const lifecycle = new WorkerLifecycle('test-queue', mockQueries, mockLogger);
  // Note: Not calling acknowledgeStart()
  assertFalse(
    lifecycle.isRunning(),
    'Worker should not be running before start'
  );

  await lifecycle.sendHeartbeat('test-function');

  assertSpyCalls(heartbeatSpy, 0);
});

test('acknowledgeStop - should mark worker as stopped and log completion', async () => {
  const mockQueries = createMockQueries();
  const mockLogger = createMockLogger();
  mockLogger.log = () => {};
  mockLogger.setWorkerId = () => {};
  const onWorkerStoppedSpy = spy(mockQueries, 'onWorkerStopped');
  const loggerLogSpy = spy(mockLogger, 'log');
  const lifecycle = new WorkerLifecycle('test-queue', mockQueries, mockLogger);
  await lifecycle.acknowledgeStart();

  assert(lifecycle.isRunning(), 'Worker should be running before stop');
  await lifecycle.acknowledgeStop();
  assertFalse(lifecycle.isRunning(), 'Worker should not be running after stop');

  assertSpyCalls(onWorkerStoppedSpy, 1);
  assertSpyCalls(loggerLogSpy, 3); // logs for start, stop acknowledgment, and stop completed
});

test('acknowledgeStop - should propagate database errors and log failure', async () => {
  const mockQueries = new Queries(null as any);
  mockQueries.onWorkerStarted = () => Promise.resolve(mockWorkerRow);
  mockQueries.onWorkerStopped = () =>
    Promise.reject(new Error('Database error'));
  mockQueries.sendHeartbeat = () => Promise.resolve();

  const mockLogger = new Logger();
  mockLogger.log = () => {};
  mockLogger.setWorkerId = () => {};

  const loggerLogSpy = spy(mockLogger, 'log');

  const lifecycle = new WorkerLifecycle('test-queue', mockQueries, mockLogger);
  await lifecycle.acknowledgeStart();

  // Test error handling
  await assertRejects(
    async () => await lifecycle.acknowledgeStop(),
    Error,
    'Database error'
  );

  assertSpyCalls(loggerLogSpy, 3);
});
