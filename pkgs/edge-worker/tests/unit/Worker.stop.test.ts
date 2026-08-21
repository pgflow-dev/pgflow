import { assertEquals } from '@std/assert';
import { Worker } from '../../src/core/Worker.ts';
import type { IBatchProcessor, ILifecycle } from '../../src/core/types.ts';
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
