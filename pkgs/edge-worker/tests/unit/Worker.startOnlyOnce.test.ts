import { assertEquals, assertRejects } from '@std/assert';
import { Worker } from '../../src/core/Worker.ts';
import type {
  IBatchProcessor,
  ILifecycle,
  WorkerBootstrap,
} from '../../src/core/types.ts';
import { createLoggingFactory } from '../../src/platform/logging.ts';

const loggingFactory = createLoggingFactory();
loggingFactory.setLogLevel('error');
const logger = loggingFactory.createLogger('Worker.startOnlyOnce.test');

function createMockLifecycle(
  state: 'created' | 'starting' | 'running' | 'stopping' | 'stopped'
): ILifecycle & { acknowledgeStartCalled: boolean; acknowledgeStartFn: (() => Promise<void>) | null } {
  return {
    acknowledgeStartCalled: false,
    acknowledgeStartFn: null,
    acknowledgeStart: function () {
      this.acknowledgeStartCalled = true;
      return this.acknowledgeStartFn ? this.acknowledgeStartFn() : Promise.resolve();
    },
    acknowledgeStop: () => {},
    sendHeartbeat: async () => {},
    edgeFunctionName: 'test-function',
    queueName: 'test-queue',
    isCreated: state === 'created',
    isStarting: state === 'starting',
    isRunning: state === 'running',
    isDeprecated: false,
    isStopping: state === 'stopping',
    isStopped: state === 'stopped',
    transitionToStopping: () => {},
  };
}

function createMockBatchProcessor(): IBatchProcessor {
  return {
    processBatch: async () => {},
    awaitCompletion: async () => {},
  };
}

const workerBootstrap: WorkerBootstrap = {
  edgeFunctionName: 'test-function',
  workerId: 'test-worker-id',
};

Deno.test('Worker.startOnlyOnce - starts worker when in Created state', async () => {
  const lifecycle = createMockLifecycle('created');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, logger);

  await worker.startOnlyOnce(workerBootstrap);

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    true,
    'Worker should start when in Created state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Starting state', async () => {
  const lifecycle = createMockLifecycle('starting');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, logger);

  await worker.startOnlyOnce(workerBootstrap);

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Starting state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Running state', async () => {
  const lifecycle = createMockLifecycle('running');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, logger);

  await worker.startOnlyOnce(workerBootstrap);

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Running state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Stopping state', async () => {
  const lifecycle = createMockLifecycle('stopping');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, logger);

  await worker.startOnlyOnce(workerBootstrap);

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Stopping state'
  );
});

Deno.test('Worker.startOnlyOnce - ignores request when in Stopped state', async () => {
  const lifecycle = createMockLifecycle('stopped');
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, logger);

  await worker.startOnlyOnce(workerBootstrap);

  assertEquals(
    lifecycle.acknowledgeStartCalled,
    false,
    'Worker should NOT start when in Stopped state'
  );
});

Deno.test('Worker.startOnlyOnce - startup rejects when acknowledgeStart fails', async () => {
  const lifecycle = createMockLifecycle('created');
  const startupError = new Error('DB connection failed');
  lifecycle.acknowledgeStartFn = () => Promise.reject(startupError);
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, logger);

  await assertRejects(
    () => worker.startOnlyOnce(workerBootstrap),
    Error,
    'DB connection failed'
  );
});

Deno.test('Worker.startOnlyOnce - readiness resolves while main loop is still running', async () => {
  let resolveProcessBatch = () => {};
  const batchProcessor: IBatchProcessor = {
    processBatch: () => new Promise<void>((resolve) => {
      resolveProcessBatch = resolve;
    }),
    awaitCompletion: () => Promise.resolve(),
  };
  const lifecycle = createMockLifecycle('created');
  const worker = new Worker(batchProcessor, lifecycle, logger);

  const readiness = worker.startOnlyOnce(workerBootstrap);

  await readiness;

  assertEquals(lifecycle.acknowledgeStartCalled, true);

  resolveProcessBatch();
});

Deno.test('Worker.startOnlyOnce - concurrent calls share one startup promise', async () => {
  let resolveAck = () => {};
  const lifecycle = createMockLifecycle('created');
  lifecycle.acknowledgeStartFn = () => new Promise<void>((resolve) => {
    resolveAck = resolve;
  });
  const batchProcessor = createMockBatchProcessor();
  const worker = new Worker(batchProcessor, lifecycle, logger);

  const p1 = worker.startOnlyOnce(workerBootstrap);
  const p2 = worker.startOnlyOnce(workerBootstrap);

  assertEquals(p1 === p2, true, 'Concurrent calls should return the same promise');

  resolveAck();
  await p1;
});
