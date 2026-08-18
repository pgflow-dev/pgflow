import { assertEquals, assertRejects } from '@std/assert';
import { Worker } from '../../src/core/Worker.ts';
import type { IBatchProcessor, ILifecycle, WorkerBootstrap } from '../../src/core/types.ts';
import { States, WorkerState } from '../../src/core/WorkerState.ts';
import { fakeLogger } from '../fakes.ts';

function createRunningLifecycle(): ILifecycle {
  let stopping = false;
  let stopped = false;

  return {
    acknowledgeStart: () => Promise.resolve(),
    acknowledgeStop: () => {
      stopped = true;
    },
    sendHeartbeat: () => Promise.resolve(),
    get edgeFunctionName() {
      return 'test-function';
    },
    get queueName() {
      return 'test-queue';
    },
    get isCreated() {
      return false;
    },
    get isStarting() {
      return false;
    },
    get isRunning() {
      return !stopping && !stopped;
    },
    get isDeprecated() {
      return false;
    },
    get isStopping() {
      return stopping;
    },
    get isStopped() {
      return stopped;
    },
    transitionToStopping: () => {
      stopping = true;
    },
  };
}

function createBatchProcessor(): IBatchProcessor {
  return {
    processBatch: () => Promise.resolve(),
    awaitCompletion: () => Promise.resolve(),
  };
}

/**
 * Lifecycle backed by a real WorkerState so stop tests exercise real
 * transition validation, with controllable startup readiness.
 */
function createStatefulLifecycle() {
  const workerState = new WorkerState(fakeLogger);
  let resolveStart: (() => void) | null = null;

  const lifecycle: ILifecycle = {
    acknowledgeStart: () => {
      workerState.transitionTo(States.Starting);
      return new Promise<void>((resolve) => {
        resolveStart = () => {
          workerState.transitionTo(States.Running);
          resolve();
        };
      });
    },
    acknowledgeStop: () => {
      workerState.transitionTo(States.Stopped);
    },
    sendHeartbeat: () => Promise.resolve(),
    get edgeFunctionName() {
      return 'test-function';
    },
    get queueName() {
      return 'test-queue';
    },
    get isCreated() {
      return workerState.isCreated;
    },
    get isStarting() {
      return workerState.isStarting;
    },
    get isRunning() {
      return workerState.isRunning;
    },
    get isDeprecated() {
      return false;
    },
    get isStopping() {
      return workerState.isStopping;
    },
    get isStopped() {
      return workerState.isStopped;
    },
    transitionToStopping: () => {
      workerState.transitionTo(States.Stopping);
    },
  };

  return {
    lifecycle,
    workerState,
    resolveStart: () => resolveStart?.(),
  };
}

const workerBootstrap: WorkerBootstrap = {
  edgeFunctionName: 'test-function',
  workerId: 'test-worker-id',
};

Deno.test('Worker.stop calls provided cleanup callback', async () => {
  let cleanupCalled = false;
  const worker = new Worker(
    createBatchProcessor(),
    createRunningLifecycle(),
    fakeLogger,
    {
      cleanup: () => {
        cleanupCalled = true;
        return Promise.resolve();
      },
    }
  );

  await worker.stop();

  assertEquals(cleanupCalled, true);
});

Deno.test('Worker.stop concurrent calls return same promise', async () => {
  let resolveCompletion = () => {};
  const batchProcessor: IBatchProcessor = {
    processBatch: () => Promise.resolve(),
    awaitCompletion: () => new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    }),
  };

  const worker = new Worker(batchProcessor, createRunningLifecycle(), fakeLogger);

  const p1 = worker.stop();
  const p2 = worker.stop();

  assertEquals(p1 === p2, true, 'Concurrent stop() calls should return the same promise');

  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveCompletion();
  await p1;
});

Deno.test('Worker.stop side effects run once', async () => {
  let transitionCount = 0;
  const lifecycle = createRunningLifecycle();
  const originalTransition = lifecycle.transitionToStopping;
  lifecycle.transitionToStopping = () => {
    transitionCount++;
    originalTransition();
  };

  const worker = new Worker(createBatchProcessor(), lifecycle, fakeLogger);

  await Promise.all([worker.stop(), worker.stop(), worker.stop()]);

  assertEquals(transitionCount, 1, 'transitionToStopping should be called once');
});

Deno.test('Worker.stop during startup aborts immediately and transitions only after readiness', async () => {
  const { lifecycle, workerState, resolveStart } = createStatefulLifecycle();
  let shutdownRequests = 0;
  let transitionsToStopping = 0;
  let stopAcknowledgements = 0;
  let processBatchCalls = 0;
  let cleanupCalls = 0;

  lifecycle.transitionToStopping = () => {
    transitionsToStopping++;
    workerState.transitionTo(States.Stopping);
  };
  lifecycle.acknowledgeStop = () => {
    stopAcknowledgements++;
    workerState.transitionTo(States.Stopped);
  };

  const batchProcessor: IBatchProcessor = {
    processBatch: () => {
      processBatchCalls++;
      return Promise.resolve();
    },
    awaitCompletion: () => Promise.resolve(),
  };

  const worker = new Worker(batchProcessor, lifecycle, fakeLogger, {
    requestShutdown: () => {
      shutdownRequests++;
    },
    cleanup: () => {
      cleanupCalls++;
      return Promise.resolve();
    },
  });

  const startup = worker.startOnlyOnce(workerBootstrap);
  assertEquals(workerState.current, States.Starting, 'lifecycle must be Starting while startup is pending');

  const stopPromise = worker.stop();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assertEquals(shutdownRequests, 1, 'shutdown must be requested while startup is pending');
  assertEquals(transitionsToStopping, 0, 'no transition while startup is pending');
  assertEquals(workerState.current, States.Starting, 'state must stay Starting while startup is pending');

  resolveStart();
  await startup;
  await stopPromise;

  assertEquals(transitionsToStopping, 1, 'exactly one transition to Stopping');
  assertEquals(stopAcknowledgements, 1, 'exactly one stop acknowledgement');
  assertEquals(workerState.current, States.Stopped);
  assertEquals(processBatchCalls, 0, 'no batch may start after shutdown was requested during startup');
  assertEquals(cleanupCalls, 1, 'cleanup must run once');
});

Deno.test('Worker.stop during startup propagates the startup error', async () => {
  const { lifecycle } = createStatefulLifecycle();
  lifecycle.acknowledgeStart = () => {
    return Promise.reject(new Error('bootstrap failed'));
  };

  const worker = new Worker(createBatchProcessor(), lifecycle, fakeLogger);

  const startup = worker.startOnlyOnce(workerBootstrap);
  const stopPromise = worker.stop();

  await assertRejects(() => startup, Error, 'bootstrap failed');
  await assertRejects(() => stopPromise, Error, 'bootstrap failed');
});

Deno.test('Worker.stop on a never-started worker reaches Stopped and cleans up once', async () => {
  const { lifecycle, workerState } = createStatefulLifecycle();
  let cleanupCalls = 0;
  let stopAcknowledgements = 0;
  lifecycle.acknowledgeStop = () => {
    stopAcknowledgements++;
    workerState.transitionTo(States.Stopped);
  };

  const worker = new Worker(createBatchProcessor(), lifecycle, fakeLogger, {
    cleanup: () => {
      cleanupCalls++;
      return Promise.resolve();
    },
  });

  await worker.stop();

  assertEquals(workerState.current, States.Stopped, 'Created -> Stopping -> Stopped must be allowed');
  assertEquals(stopAcknowledgements, 1);
  assertEquals(cleanupCalls, 1, 'cleanup must run once');
});

Deno.test('Worker.startOnlyOnce is ignored after a Created-state stop', async () => {
  const { lifecycle } = createStatefulLifecycle();
  let acknowledgeStartCalls = 0;
  lifecycle.acknowledgeStart = () => {
    acknowledgeStartCalls++;
    return Promise.resolve();
  };

  const worker = new Worker(createBatchProcessor(), lifecycle, fakeLogger);
  await worker.stop();

  await worker.startOnlyOnce(workerBootstrap);

  assertEquals(acknowledgeStartCalls, 0, 'start must be ignored after the worker already stopped');
  assertEquals(lifecycle.isStopped, true);
});
