import { assertEquals, assertRejects } from '@std/assert';
import { StepTaskPoller } from '../../src/flow/StepTaskPoller.ts';
import { FatalWorkerError } from '../../src/core/errors.ts';
import { fakeLogger } from '../fakes.ts';

interface RecordedLogger {
  warnings: string[];
  errors: string[];
}

function recordingLogger(): { logger: typeof fakeLogger; recorded: RecordedLogger } {
  const recorded: RecordedLogger = { warnings: [], errors: [] };
  const logger = {
    ...fakeLogger,
    warn: (message: string) => recorded.warnings.push(message),
    error: (message: string) => recorded.errors.push(message),
  };
  return { logger, recorded };
}

const BIG_ID = '9007199254740993';

function makeAdapter(overrides: Record<string, unknown> = {}) {
  return {
    readMessages: () =>
      Promise.resolve([
        {
          msg_id: BIG_ID,
          read_ct: 1,
          enqueued_at: '2026-01-01T00:00:00Z',
          vt: '2026-01-01T00:00:02Z',
          message: { flow_slug: 'Orders', step_slug: 'saveItem' },
        },
        {
          msg_id: '9007199254740994',
          read_ct: 1,
          enqueued_at: '2026-01-01T00:00:00Z',
          vt: '2026-01-01T00:00:02Z',
          message: { hello: 'SECRET_BODY_TOKEN' },
        },
      ]),
    startTasks: () => Promise.resolve({ status: 'ok', tasks: [], warnings: [] }),
    ...overrides,
  };
}

function makePoller(adapter: unknown, logger = fakeLogger) {
  return new StepTaskPoller(
    adapter as never,
    new AbortController().signal,
    {
      batchSize: 10,
      queueName: 'orders',
      flowSlug: 'Orders',
      visibilityTimeout: 2,
      maxPollSeconds: 1,
      pollIntervalMs: 10,
    },
    () => 'worker-id',
    logger
  );
}

Deno.test('StepTaskPoller passes queue and flow separately and returns paired tasks', async () => {
  let captured: { queueName: string; flowSlug: string; messageIds: string[] } | undefined;
  const adapter = makeAdapter({
    startTasks: (queueName: string, flowSlug: string, messageIds: string[]) => {
      captured = { queueName, flowSlug, messageIds };
      return Promise.resolve({
        status: 'ok',
        tasks: [
          {
            flow_slug: 'Orders',
            run_id: '11111111-1111-1111-1111-111111111111',
            step_slug: 'saveItem',
            task_index: 0,
            queue_name: 'orders',
            input: {},
            msg_id: BIG_ID,
            flow_input: null,
          },
        ],
        warnings: [],
      });
    },
  });

  const result = await makePoller(adapter).poll();

  assertEquals(captured!.queueName, 'orders');
  assertEquals(captured!.flowSlug, 'Orders');
  assertEquals(captured!.messageIds, [BIG_ID, '9007199254740994']);
  assertEquals(result.length, 1);
  assertEquals(result[0].msg_id, BIG_ID);
  assertEquals(result[0].task.queue_name, 'orders');
});

Deno.test('StepTaskPoller logs one body-free warning per foreign message', async () => {
  const { logger, recorded } = recordingLogger();
  const adapter = makeAdapter({
    startTasks: () =>
      Promise.resolve({
        status: 'ok',
        tasks: [],
        warnings: [
          {
            queue_name: 'orders',
            message_id: '9007199254740994',
            reason: 'foreign_message',
          },
        ],
      }),
  });

  const result = await makePoller(adapter, logger).poll();

  assertEquals(result.length, 0);
  assertEquals(recorded.warnings.length, 1);
  assertEquals(
    recorded.warnings[0],
    'Claim warning: reason=foreign_message queue=orders message_id=9007199254740994'
  );
  assertEquals(recorded.warnings[0].includes('SECRET_BODY_TOKEN'), false);
});

Deno.test('StepTaskPoller translates a committed fatal result into FatalWorkerError', async () => {
  const adapter = makeAdapter({
    startTasks: () =>
      Promise.resolve({
        status: 'fatal',
        tasks: [],
        errors: [
          {
            queue_name: 'orders',
            message_id: '9007199254740994',
            reason: 'unsupported_work',
          },
        ],
      }),
  });

  const error = await assertRejects(
    () => makePoller(adapter).poll(),
    FatalWorkerError
  );

  assertEquals(error.name, 'FatalWorkerError');
  assertEquals(error.message.includes('reason=unsupported_work'), true);
  assertEquals(error.message.includes('queue=orders'), true);
  assertEquals(error.message.includes('message_id=9007199254740994'), true);
  assertEquals(error.message.includes('SECRET_BODY_TOKEN'), false);
});

Deno.test('StepTaskPoller keeps ordinary SQL exceptions retryable', async () => {
  const adapter = makeAdapter({
    readMessages: () => Promise.reject(new Error('connection refused')),
  });

  const error = await assertRejects(() => makePoller(adapter).poll(), Error);
  assertEquals(error instanceof FatalWorkerError, false);
  assertEquals(error.message, 'connection refused');
});
