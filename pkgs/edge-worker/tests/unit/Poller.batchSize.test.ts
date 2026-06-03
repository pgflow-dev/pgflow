import { assertEquals } from '@std/assert';
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
