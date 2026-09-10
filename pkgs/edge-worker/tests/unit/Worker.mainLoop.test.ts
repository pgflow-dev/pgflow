import { assertEquals } from '@std/assert';
import { FakeTime } from '@std/testing/time';
import { Worker } from '../../src/core/Worker.ts';
import type { IBatchProcessor, ILifecycle, WorkerBootstrap } from '../../src/core/types.ts';
import { States, WorkerState } from '../../src/core/WorkerState.ts';
import { FatalWorkerError } from '../../src/core/errors.ts';
import { fakeLogger } from '../fakes.ts';

/**
 * Lifecycle backed by a real WorkerState: acknowledgeStart transitions
 * Created -> Starting -> Running, so the main loop runs until stop().
 */
function createRunningLifecycle(): ILifecycle {
  const workerState = new WorkerState(fakeLogger);

  return {
    acknowledgeStart: () => {
      workerState.transitionTo(States.Starting);
      workerState.transitionTo(States.Running);
      return Promise.resolve();
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
      return workerState.isDeprecated;
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
}

function createBatchProcessor(
  outcomeFor: (attempt: number) => Promise<void>,
  batchTimes: number[]
): IBatchProcessor {
  return {
    processBatch: () => {
      batchTimes.push(Date.now());
      return outcomeFor(batchTimes.length);
    },
    awaitCompletion: () => Promise.resolve(),
  };
}

/**
 * Advances the fake clock by `ms` and settles the loop continuation that the
 * fired timer unblocks. Sync tick + microtask drain keeps the clock at each
 * timer's due time, so Date.now() stamps land exactly on schedule.
 */
async function advance(time: FakeTime, ms: number) {
  time.tick(ms);
  await time.runMicrotasks();
  await time.runMicrotasks();
}

const workerBootstrap: WorkerBootstrap = {
  edgeFunctionName: 'test-function',
  workerId: 'test-worker-id',
};

const fail = () => Promise.reject(new Error('db down'));
const succeed = () => Promise.resolve();

Deno.test('Worker main loop delays the next iteration after a failed iteration', async () => {
  const time = new FakeTime();
  try {
    const batchTimes: number[] = [];
    const worker = new Worker(
      createBatchProcessor(fail, batchTimes),
      createRunningLifecycle(),
      fakeLogger
    );

    await worker.startOnlyOnce(workerBootstrap);
    await time.runMicrotasks();
    assertEquals(batchTimes.length, 1);

    await advance(time, 50);
    assertEquals(batchTimes.length, 1, 'second iteration must not run immediately after a failure');

    await advance(time, 50);
    assertEquals(batchTimes.length, 2, 'second iteration runs after the initial 100ms backoff');
    assertEquals(batchTimes[1]! - batchTimes[0]!, 100);

    await worker.stop();
  } finally {
    time.restore();
  }
});

Deno.test('Worker main loop backoff grows exponentially and caps at five seconds', async () => {
  const time = new FakeTime();
  try {
    const batchTimes: number[] = [];
    const worker = new Worker(
      createBatchProcessor(fail, batchTimes),
      createRunningLifecycle(),
      fakeLogger
    );

    await worker.startOnlyOnce(workerBootstrap);
    await time.runMicrotasks();
    assertEquals(batchTimes.length, 1);

    for (const delay of [100, 200, 400, 800, 1600, 3200, 5000, 5000]) {
      await advance(time, delay);
    }
    assertEquals(batchTimes.length, 9);

    await worker.stop();

    const deltas = batchTimes.slice(1).map((t, i) => t - batchTimes[i]!);
    assertEquals(deltas, [100, 200, 400, 800, 1600, 3200, 5000, 5000]);
  } finally {
    time.restore();
  }
});

Deno.test('Worker main loop resets the backoff after a fully successful iteration', async () => {
  const time = new FakeTime();
  try {
    const batchTimes: number[] = [];
    // fail, fail, succeed, fail, fail - the fifth call only exists to time
    // the delay after the fourth (post-reset) failure.
    const script = [fail, fail, succeed, fail, fail];
    const worker = new Worker(
      createBatchProcessor((attempt) => script[Math.min(attempt - 1, script.length - 1)](), batchTimes),
      createRunningLifecycle(),
      fakeLogger
    );

    await worker.startOnlyOnce(workerBootstrap);
    await time.runMicrotasks();
    assertEquals(batchTimes.length, 1);

    await advance(time, 100); // second failure at +100, backoff grows to 200
    await advance(time, 200); // success at +300, loop continues without delay
    await advance(time, 100); // fourth failure at +300, backoff reset to 100
    assertEquals(batchTimes.length, 5);

    await worker.stop();

    const deltas = batchTimes.slice(1).map((t, i) => t - batchTimes[i]!);
    // Failures grow 100 -> 200, the successful iteration proceeds without a
    // delay (0), and the next failure starts over at the initial 100ms.
    assertEquals(deltas, [100, 200, 0, 100]);
  } finally {
    time.restore();
  }
});

Deno.test('Worker stop completes immediately while a retry delay is pending', async () => {
  const time = new FakeTime();
  try {
    const batchTimes: number[] = [];
    const worker = new Worker(
      createBatchProcessor(fail, batchTimes),
      createRunningLifecycle(),
      fakeLogger
    );

    await worker.startOnlyOnce(workerBootstrap);
    await time.runMicrotasks();
    assertEquals(batchTimes.length, 1);

    // No clock advance happens here: stop must not wait out the 100ms delay.
    await worker.stop();

    assertEquals(batchTimes.length, 1, 'no further iteration after stop');
  } finally {
    time.restore();
  }
});

Deno.test('Worker main loop stops terminally after a fatal batch', async () => {
  const time = new FakeTime();
  try {
    const batchTimes: number[] = [];
    const fatalErrors: string[] = [];
    const logger = {
      ...fakeLogger,
      error: (message: string) => fatalErrors.push(message),
    };
    let stopAcknowledged = 0;
    let cleanups = 0;
    const lifecycle = createRunningLifecycle();
    const origAcknowledgeStop = lifecycle.acknowledgeStop;
    lifecycle.acknowledgeStop = () => {
      stopAcknowledged++;
      origAcknowledgeStop.call(lifecycle);
    };

    const fatal = () =>
      Promise.reject(
        new FatalWorkerError(
          'Committed fatal claim batch: reason=unsupported_work queue=orders message_id=9007199254740994'
        )
      );
    const worker = new Worker(
      createBatchProcessor(fatal, batchTimes),
      lifecycle,
      logger,
      { cleanup: () => { cleanups++; return Promise.resolve(); } }
    );

    await worker.startOnlyOnce(workerBootstrap);
    // Drain the fatal branch, the scheduled stop, and performStop's wait on
    // the main-loop promise.
    for (let i = 0; i < 5; i++) {
      await time.runMicrotasks();
    }

    assertEquals(batchTimes.length, 1, 'exactly one poll happens before the fatal stop');

    // No retry timer is scheduled after a fatal batch.
    await advance(time, 10_000);
    assertEquals(batchTimes.length, 1, 'no retry iteration after a fatal batch');

    await worker.stop();

    assertEquals(worker.isStopped, true, 'the worker reaches the stopped state');
    assertEquals(stopAcknowledged, 1, 'stop is acknowledged exactly once');
    assertEquals(cleanups, 1, 'cleanup runs exactly once');
    assertEquals(fatalErrors.length, 1, 'the fatal outcome is logged exactly once');
    assertEquals(
      fatalErrors[0]!.includes('reason=unsupported_work') &&
        fatalErrors[0]!.includes('message_id=9007199254740994'),
      true,
      'the fatal log is the body-free diagnostic line'
    );
  } finally {
    time.restore();
  }
});
