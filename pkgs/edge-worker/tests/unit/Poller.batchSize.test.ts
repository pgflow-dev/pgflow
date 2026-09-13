import { assertEquals, assertRejects } from '@std/assert';
import { ReadWithPollPoller } from '../../src/queue/ReadWithPollPoller.ts';
import { StepTaskPoller } from '../../src/flow/StepTaskPoller.ts';
import { fakeLogger } from '../fakes.ts';

Deno.test('ReadWithPollPoller caps limit at configured batchSize', async () => {
  let readQty: number | undefined;
  const queue = {
    queueName: 'test_queue',
    readWithPoll: (qty: number) => {
      readQty = qty;
      return Promise.resolve([]);
    },
  };

  const poller = new ReadWithPollPoller(
    queue as never,
    new AbortController().signal,
    {
      batchSize: 5,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
      visibilityTimeout: 10,
    },
    fakeLogger
  );

  await poller.poll(20);

  assertEquals(readQty, 5);
});

Deno.test('ReadWithPollPoller uses smaller available slot limit', async () => {
  let readQty: number | undefined;
  const queue = {
    queueName: 'test_queue',
    readWithPoll: (qty: number) => {
      readQty = qty;
      return Promise.resolve([]);
    },
  };

  const poller = new ReadWithPollPoller(
    queue as never,
    new AbortController().signal,
    {
      batchSize: 5,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
      visibilityTimeout: 10,
    },
    fakeLogger
  );

  await poller.poll(2);

  assertEquals(readQty, 2);
});

Deno.test('ReadWithPollPoller uses configured batchSize without limit', async () => {
  let readQty: number | undefined;
  const queue = {
    queueName: 'test_queue',
    readWithPoll: (qty: number) => {
      readQty = qty;
      return Promise.resolve([]);
    },
  };

  const poller = new ReadWithPollPoller(
    queue as never,
    new AbortController().signal,
    {
      batchSize: 5,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
      visibilityTimeout: 10,
    },
    fakeLogger
  );

  await poller.poll();

  assertEquals(readQty, 5);
});

Deno.test('StepTaskPoller caps limit at configured batchSize', async () => {
  let readQty: number | undefined;
  const adapter = {
    readMessages: (
      _queueName: string,
      _visibilityTimeout: number,
      qty: number
    ) => {
      readQty = qty;
      return Promise.resolve([]);
    },
    startTasks: () => Promise.resolve([]),
  };

  const poller = new StepTaskPoller(
    adapter as never,
    new AbortController().signal,
    {
      batchSize: 5,
      flowSlug: 'test_flow',
      queueName: 'test_flow',
      visibilityTimeout: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    },
    () => 'worker-id',
    fakeLogger
  );

  await poller.poll(20);

  assertEquals(readQty, 5);
});

Deno.test('StepTaskPoller uses smaller available slot limit', async () => {
  let readQty: number | undefined;
  const adapter = {
    readMessages: (
      _queueName: string,
      _visibilityTimeout: number,
      qty: number
    ) => {
      readQty = qty;
      return Promise.resolve([]);
    },
    startTasks: () => Promise.resolve([]),
  };

  const poller = new StepTaskPoller(
    adapter as never,
    new AbortController().signal,
    {
      batchSize: 5,
      flowSlug: 'test_flow',
      queueName: 'test_flow',
      visibilityTimeout: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    },
    () => 'worker-id',
    fakeLogger
  );

  await poller.poll(2);

  assertEquals(readQty, 2);
});

Deno.test('StepTaskPoller uses configured batchSize without limit', async () => {
  let readQty: number | undefined;
  const adapter = {
    readMessages: (
      _queueName: string,
      _visibilityTimeout: number,
      qty: number
    ) => {
      readQty = qty;
      return Promise.resolve([]);
    },
    startTasks: () => Promise.resolve([]),
  };

  const poller = new StepTaskPoller(
    adapter as never,
    new AbortController().signal,
    {
      batchSize: 5,
      flowSlug: 'test_flow',
      queueName: 'test_flow',
      visibilityTimeout: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    },
    () => 'worker-id',
    fakeLogger
  );

  await poller.poll();

  assertEquals(readQty, 5);
});

Deno.test('StepTaskPoller rethrows readMessages failures instead of returning an empty batch', async () => {
  const adapter = {
    readMessages: () => Promise.reject(new Error('connection refused')),
    startTasks: () => Promise.resolve([]),
  };

  const poller = new StepTaskPoller(
    adapter as never,
    new AbortController().signal,
    {
      batchSize: 5,
      flowSlug: 'test_flow',
      queueName: 'test_flow',
      visibilityTimeout: 10,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    },
    () => 'worker-id',
    fakeLogger
  );

  await assertRejects(() => poller.poll(), Error, 'connection refused');
});

Deno.test('StepTaskPoller claims through the polled queue name and warns for unmatched messages', async () => {
  const started: unknown[][] = [];
  const warnings: string[] = [];
  const messages = [
    { msg_id: '7', read_ct: 1, enqueued_at: '', vt: '', message: {} },
    { msg_id: '9223372036854775807', read_ct: 1, enqueued_at: '', vt: '', message: {} },
  ];
  const adapter = {
    readMessages: (_queueName: string, _vt: number, _qty: number) =>
      Promise.resolve(messages),
    startTasks: (...args: unknown[]) => {
      started.push(args);
      // Only the first message has a claimable task
      return Promise.resolve([
        { flow_slug: 'f', run_id: 'r', step_slug: 's', task_index: 0, input: {}, msg_id: '7', flow_input: null },
      ]);
    },
  };
  const logger = {
    ...fakeLogger,
    warn: (msg: string) => warnings.push(msg),
  };

  const poller = new StepTaskPoller(
    adapter as never,
    new AbortController().signal,
    {
      batchSize: 5,
      flowSlug: 'TestFlow',
      queueName: 'testflow',
      visibilityTimeout: 2,
      maxPollSeconds: 1,
      pollIntervalMs: 100,
    },
    () => 'worker-id',
    logger,
    () => 'TestFlow' // legacy mixed-case physical spelling
  );

  const tasks = await poller.poll();

  // The claim received the expected flow, exact msg ids, and the polled queue
  assertEquals(started, [[
    'TestFlow',
    ['7', '9223372036854775807'],
    'worker-id',
    'TestFlow',
  ]]);
  assertEquals(tasks.length, 1);
  assertEquals(tasks[0].msg_id, '7');

  // The unmatched message is reported with identifiers only
  assertEquals(warnings.length, 1);
  assertEquals(warnings[0].includes('9223372036854775807'), true);
  assertEquals(warnings[0].includes("Queue 'TestFlow'"), true);
});
