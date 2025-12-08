import { assertEquals } from '@std/assert';
import { Worker } from '../../src/core/Worker.ts';
import type {
  IBatchProcessor,
  ILifecycle,
  WorkerBootstrap,
} from '../../src/core/types.ts';
import { createLoggingFactory } from '../../src/platform/logging.ts';

const loggingFactory = createLoggingFactory();
loggingFactory.setLogLevel('error'); // Suppress debug output during tests
const logger = loggingFactory.createLogger('Worker.startOnlyOnce.test');

// Mock ILifecycle that tracks calls and allows controlling state
function createMockLifecycle(
  state: 'created' | 'starting' | 'running' | 'stopping' | 'stopped'
): ILifecycle & { acknowledgeStartCalled: boolean } {
  return {
    acknowledgeStartCalled: false,
    acknowledgeStart: function () {
      this.acknowledgeStartCalled = true;
      return Promise.resolve();
    },
    acknowledgeStop: () => {},
    sendHeartbeat: async () => {},
    edgeFunctionName: 'test-function',
    queueName: 'test-queue',
    isCreated: state === 'created',
    isRunning: state === 'running',
    isStopping: state === 'stopping',
    isStopped: state === 'stopped',
    transitionToStopping: () => {},
  };
}

// Mock IBatchProcessor
function createMockBatchProcessor(): IBatchProcessor {
  return {
    processBatch: async () => {},
    awaitCompletion: async () => {},
  };
}

// Mock SQL connection
const mockSql = {
  end: async () => {},
} as never;

const workerBootstrap: WorkerBootstrap = {
  edgeFunctionName: 'test-function',
  workerId: 'test-worker-id',
};

Deno.test('Worker.startOnlyOnce - starts worker when in Created state', async () => {
  const lifecycle = createMockLifecycle('created');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, mockSql as never, logger);

  worker.startOnlyOnce(workerBootstrap);

  // Give the async start() a moment to call acknowledgeStart
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    true,
    'Worker should start when in Created state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Starting state', async () => {
  const lifecycle = createMockLifecycle('starting');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, mockSql as never, logger);

  worker.startOnlyOnce(workerBootstrap);

  // Give any async operations a moment
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Starting state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Running state', async () => {
  const lifecycle = createMockLifecycle('running');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, mockSql as never, logger);

  worker.startOnlyOnce(workerBootstrap);

  // Give any async operations a moment
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Running state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Stopping state', async () => {
  const lifecycle = createMockLifecycle('stopping');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, mockSql as never, logger);

  worker.startOnlyOnce(workerBootstrap);

  // Give any async operations a moment
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Stopping state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Stopped state', async () => {
  const lifecycle = createMockLifecycle('stopped');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, mockSql as never, logger);

  worker.startOnlyOnce(workerBootstrap);

  // Give any async operations a moment
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Stopped state'
  );
});
