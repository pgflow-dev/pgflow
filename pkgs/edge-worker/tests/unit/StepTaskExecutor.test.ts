import { assertEquals, assertRejects, assertStrictEquals } from '@std/assert';
import { Flow } from '@pgflow/dsl';
import type { IPgflowClient, Json, StepTaskKey, StepTaskRecord } from '@pgflow/core';
import { StepTaskExecutor } from '../../src/flow/StepTaskExecutor.ts';
import { ExecutionController } from '../../src/core/ExecutionController.ts';
import type { Logger } from '../../src/platform/types.ts';
import { fakeLogger } from '../fakes.ts';

function setup(
  handler: () => Json | Promise<Json>,
  options: {
    controller?: AbortController;
    logger?: Partial<Logger>;
    completeTask?: IPgflowClient['completeTask'];
    failTask?: IPgflowClient['failTask'];
  } = {}
) {
  const controller = options.controller ?? new AbortController();
  let handlerCalls = 0;
  const flow = new Flow({ slug: 'result_boundary' }).step({ slug: 'work' }, () => {
    handlerCalls++;
    return handler();
  });
  const task: StepTaskRecord<typeof flow> = {
    flow_slug: flow.slug,
    step_slug: 'work',
    run_id: 'test-run',
    task_index: 0,
    msg_id: '1',
    input: {},
    flow_input: {},
  };
  const completions: Array<{ task: StepTaskKey; output: Json | undefined }> = [];
  const failures: Array<{ task: StepTaskKey; error: unknown }> = [];
  const adapter: IPgflowClient<typeof flow> = {
    startFlow: () => { throw new Error('Unexpected startFlow'); },
    readMessages: () => { throw new Error('Unexpected readMessages'); },
    startTasks: () => { throw new Error('Unexpected startTasks'); },
    completeTask: async (task, output) => {
      completions.push({ task, output });
      await options.completeTask?.(task, output);
    },
    failTask: async (task, error) => {
      failures.push({ task, error });
      await options.failTask?.(task, error);
    },
  };
  const executor = new StepTaskExecutor(
    flow,
    adapter,
    controller.signal,
    { ...fakeLogger, ...options.logger },
    {
      env: {},
      shutdownSignal: controller.signal,
      stepTask: task,
      rawMessage: {
        msg_id: '1',
        read_ct: 1,
        enqueued_at: '2026-01-01T00:00:00Z',
        vt: '2026-01-01T00:01:00Z',
        message: {},
      },
      workerConfig: {
        maxConcurrent: 1,
        maxPollSeconds: 1,
        pollIntervalMs: 100,
        batchSize: 1,
        visibilityTimeout: 2,
      },
      flowInput: Promise.resolve({}),
    },
    { workerId: 'worker', workerName: 'test', queueName: flow.slug }
  );
  return { executor, task, completions, failures, get handlerCalls() { return handlerCalls; } };
}

Deno.test('StepTaskExecutor - completion rejection surfaces without reporting handler failure or replay', async () => {
  const error = new Error('Completion acknowledgement unknown');
  const test = setup(() => ({ value: 42 }), {
    completeTask: () => Promise.reject(error),
  });

  const caught = await assertRejects(() => test.executor.execute());

  assertStrictEquals(caught, error);
  assertEquals(test.completions, [{ task: test.task, output: { value: 42 } }]);
  assertEquals(test.failures, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - completion logging failure surfaces after the original result is reported', async () => {
  const error = new Error('Completion logger unavailable');
  const output = { value: 42 };
  const test = setup(() => output, {
    logger: { taskCompleted: () => { throw error; } },
  });

  const caught = await assertRejects(() => test.executor.execute());

  assertStrictEquals(caught, error);
  assertEquals(test.completions, [{ task: test.task, output }]);
  assertStrictEquals(test.completions[0].output, output);
  assertEquals(test.failures, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - failure logging error surfaces after the original handler error is reported', async () => {
  const handlerError = new Error('Handler failed');
  const logError = new Error('Failure logger unavailable');
  const test = setup(() => { throw handlerError; }, {
    logger: { taskFailed: () => { throw logError; } },
  });

  const caught = await assertRejects(() => test.executor.execute());

  assertStrictEquals(caught, logError);
  assertEquals(test.failures, [{ task: test.task, error: handlerError }]);
  assertStrictEquals(test.failures[0].error, handlerError);
  assertEquals(test.completions, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - pre-handler logging failure does not run or fail the handler', async () => {
  const error = new Error('Start logger unavailable');
  const test = setup(() => 42, {
    logger: { taskStarted: () => { throw error; } },
  });

  const caught = await assertRejects(() => test.executor.execute());

  assertStrictEquals(caught, error);
  assertEquals(test.handlerCalls, 0);
  assertEquals(test.completions, []);
  assertEquals(test.failures, []);
});

Deno.test('StepTaskExecutor - unrelated AbortError with a live shutdown signal is a handler failure', async () => {
  const error = new DOMException('Request timed out', 'AbortError');
  const test = setup(() => { throw error; });

  await test.executor.execute();

  assertEquals(test.failures, [{ task: test.task, error }]);
  assertStrictEquals(test.failures[0].error, error);
  assertEquals(test.completions, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - already-aborted execution does not start or report a handler failure', async () => {
  const controller = new AbortController();
  controller.abort('Worker stopped');
  let started = false;
  const test = setup(() => 42, {
    controller,
    logger: { taskStarted: () => { started = true; } },
  });

  await test.executor.execute();

  assertEquals(started, false);
  assertEquals(test.handlerCalls, 0);
  assertEquals(test.completions, []);
  assertEquals(test.failures, []);
});

Deno.test('StepTaskExecutor - failure acknowledgement rejection does not report twice or replay the handler', async () => {
  const handlerError = new Error('Handler failed');
  const reportError = new Error('Failure acknowledgement unknown');
  const test = setup(() => { throw handlerError; }, {
    failTask: () => Promise.reject(reportError),
  });

  const caught = await assertRejects(() => test.executor.execute());

  assertStrictEquals(caught, reportError);
  assertEquals(test.failures, [{ task: test.task, error: handlerError }]);
  assertStrictEquals(test.failures[0].error, handlerError);
  assertEquals(test.completions, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - actual shutdown with arbitrary thrown reasons does not report business failure', async () => {
  for (const reason of [new Error('Connection closed'), 'Worker stopped', undefined]) {
    const controller = new AbortController();
    const test = setup(() => {
      controller.abort('Shutdown requested');
      throw reason;
    }, { controller });

    await test.executor.execute();

    assertEquals(test.handlerCalls, 1);
    assertEquals(test.completions, []);
    assertEquals(test.failures, []);
  }
});

Deno.test('StepTaskExecutor - shutdown during start logging does not start or fail a handler', async () => {
  const controller = new AbortController();
  const test = setup(() => 42, {
    controller,
    logger: { taskStarted: () => controller.abort('Shutdown requested') },
  });

  await test.executor.execute();

  assertEquals(test.handlerCalls, 0);
  assertEquals(test.completions, []);
  assertEquals(test.failures, []);
});

Deno.test('StepTaskExecutor - success still reports once when shutdown starts after the handler returns', async () => {
  const controller = new AbortController();
  const output = { value: 42 };
  const test = setup(() => output, {
    controller,
    logger: { taskCompleted: () => controller.abort('Shutdown requested') },
  });

  await test.executor.execute();

  assertEquals(controller.signal.aborted, true);
  assertEquals(test.completions, [{ task: test.task, output }]);
  assertEquals(test.failures, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - acknowledgement rejection during shutdown retains handler success', async () => {
  const controller = new AbortController();
  const error = new Error('Connection closed during shutdown');
  const test = setup(() => {
    controller.abort('Shutdown requested');
    return false;
  }, {
    controller,
    completeTask: () => Promise.reject(error),
  });

  const caught = await assertRejects(() => test.executor.execute());

  assertStrictEquals(caught, error);
  assertEquals(test.completions, [{ task: test.task, output: false }]);
  assertEquals(test.failures, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - serialization failure after success never becomes handler failure', async () => {
  const output: { self?: Json } = {};
  output.self = output;
  const test = setup(() => output, {
    completeTask: (_task, result) => {
      JSON.stringify(result);
      return Promise.resolve();
    },
  });

  await assertRejects(() => test.executor.execute(), TypeError);

  assertEquals(test.completions.length, 1);
  assertStrictEquals(test.completions[0].output, output);
  assertEquals(test.failures, []);
  assertEquals(test.handlerCalls, 1);
});

Deno.test('StepTaskExecutor - telemetry and reporting errors both reach the existing worker error boundary', async () => {
  for (const outcome of ['success', 'failure'] as const) {
    const controller = new AbortController();
    const handlerError = new Error('Handler failed');
    const logError = new Error('Telemetry unavailable');
    const reportError = new Error('Acknowledgement unknown');
    const test = setup(() => {
      if (outcome === 'failure') throw handlerError;
      return 42;
    }, {
      controller,
      logger: {
        taskCompleted: () => { throw logError; },
        taskFailed: () => { throw logError; },
      },
      completeTask: () => Promise.reject(reportError),
      failTask: () => Promise.reject(reportError),
    });
    const observed: unknown[] = [];
    const executions = new ExecutionController(
      () => test.executor,
      controller.signal,
      { maxConcurrent: 1 },
      { ...fakeLogger, error: (_message, error) => { observed.push(error); } }
    );

    const caught = await assertRejects(
      () => executions.start({ msg_id: '1' }),
      AggregateError
    );
    await executions.awaitCompletion();

    assertEquals(caught.errors.length, 2);
    assertStrictEquals(caught.errors[0], logError);
    assertStrictEquals(caught.errors[1], reportError);
    assertStrictEquals(observed[0], caught);
    assertEquals(observed.length, 1);
    assertEquals(test.handlerCalls, 1);
    assertEquals(test.completions.length, outcome === 'success' ? 1 : 0);
    assertEquals(test.failures.length, outcome === 'failure' ? 1 : 0);
    if (outcome === 'failure') assertStrictEquals(test.failures[0].error, handlerError);
  }
});

Deno.test('StepTaskExecutor - live handler failures report the original thrown value once', async () => {
  for (const error of [new Error('Handler failed'), 'Bad input', undefined]) {
    const test = setup(() => { throw error; });

    await test.executor.execute();

    assertEquals(test.failures, [{ task: test.task, error }]);
    assertStrictEquals(test.failures[0].error, error);
    assertEquals(test.completions, []);
    assertEquals(test.handlerCalls, 1);
  }
});
