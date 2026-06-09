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
