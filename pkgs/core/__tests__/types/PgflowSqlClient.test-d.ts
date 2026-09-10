import { describe, it, expectTypeOf, vi, beforeEach } from 'vitest';
import { setupPostgresMock } from '../mocks/postgres.js';

// Mock the postgres module so that it never makes a real connection.
// This must come before the postgres import
vi.mock('postgres', () => {
  return setupPostgresMock();
});

import { PgflowSqlClient } from '../../src/PgflowSqlClient.js';
import type {
  ClaimDiagnostic,
  ClaimTasksResult,
  Json,
  StepTaskKey,
  StepTaskRecord,
} from '../../src/types.js';
import postgres from 'postgres';
import { Flow } from '@pgflow/dsl';

describe('PgflowSqlClient Type Compatibility with Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should properly type IPgflowClient methods', () => {
    // Arrange
    const sql = postgres();
    const flow = new Flow<{ url: string }>({ slug: 'test_flow' });
    const client = new PgflowSqlClient<typeof flow>(sql);

    // Check startTasks method types
    expectTypeOf(client.startTasks).toBeFunction();
    expectTypeOf(client.startTasks).parameters.toMatchTypeOf<
      [string, string, string[], string]
    >();
    expectTypeOf(client.startTasks).returns.toEqualTypeOf<
      Promise<ClaimTasksResult<typeof flow>>
    >();

    // Check completeTask method types
    expectTypeOf(client.completeTask).toBeFunction();
    expectTypeOf(client.completeTask).parameters.toMatchTypeOf<
      [StepTaskKey, Json?]
    >();

    // Check failTask method types
    expectTypeOf(client.failTask).toBeFunction();
    expectTypeOf(client.failTask).parameters.toMatchTypeOf<
      [StepTaskKey, unknown]
    >();
  });

  it('allows only valid Flow input', () => {
    const sql = postgres();
    const flow = new Flow<{ url: string }>({ slug: 'test_flow' });
    const client = new PgflowSqlClient<typeof flow>(sql);

    // @ts-expect-error - Flow expects { url: string } not a number
    client.startFlow(flow, 23);

    // @ts-expect-error - Flow expects { url: string }
    client.startFlow(flow, { url: 23 });

    // @ts-expect-error - Flow does not accept extraneous keys
    client.startFlow(flow, { url: 'string', extraneousKey: 'value' });
  });

  it('types the claim contract as a discriminated union with queue-aware records', () => {
    const stepFlow = new Flow<{ url: string }>({ slug: 'test_flow' }).step(
      { slug: 'run' },
      () => null
    );
    type FlowType = typeof stepFlow;
    type Result = ClaimTasksResult<FlowType>;

    const ok: Result = {
      status: 'ok',
      tasks: [
        {
          flow_slug: 'test_flow',
          run_id: '11111111-1111-1111-1111-111111111111',
          step_slug: 'run',
          task_index: 0,
          queue_name: 'test_flow',
          input: { url: 'x' },
          msg_id: '9007199254740993',
          flow_input: null,
        },
      ],
      warnings: [
        { queue_name: 'test_flow', message_id: '9007199254740994', reason: 'foreign_message' },
      ],
    };
    expectTypeOf(ok.tasks).toEqualTypeOf<StepTaskRecord<FlowType>[]>();
    expectTypeOf(ok.tasks[0]!.queue_name).toEqualTypeOf<string>();
    expectTypeOf(ok.tasks[0]!.msg_id).toEqualTypeOf<string>();

    const fatal: Result = {
      status: 'fatal',
      tasks: [],
      errors: [
        { queue_name: 'test_flow', message_id: '9007199254740995', reason: 'unsupported_work' },
      ],
    };
    if (fatal.status === 'fatal') {
      expectTypeOf(fatal.tasks).toEqualTypeOf<[]>();
      expectTypeOf(fatal.errors[0]!.reason).toEqualTypeOf<
        'foreign_message' | 'unsupported_work' | 'wrong_route' | 'invalid_subscription'
      >();
      expectTypeOf(fatal.errors[0]!.message_id).toEqualTypeOf<string>();
    }

    const badReason = { queue_name: 'q', message_id: '1', reason: 'something_else' };
    // @ts-expect-error - diagnostics reject arbitrary reason strings
    const rejectedReason: ClaimDiagnostic = badReason;
    const badId = { queue_name: 'q', message_id: 1, reason: 'foreign_message' };
    // @ts-expect-error - diagnostic message ids are strings, not numbers
    const rejectedId: ClaimDiagnostic = badId;
    void [rejectedReason, rejectedId];
  });

  it('should properly type startTasks method parameters', () => {
    const sql = postgres();
    const flow = new Flow<{ url: string }>({ slug: 'test_flow' });
    const client = new PgflowSqlClient<typeof flow>(sql);

    // Valid calls should compile: queue, flow, decimal-string ids, worker.
    client.startTasks('queue', 'flow_slug', ['1', '2', '3'], 'worker-id');
    client.startTasks('queue', 'flow_slug', [], 'worker-id');

    // @ts-expect-error - queueName must be string
    client.startTasks(123, 'flow_slug', ['1'], 'worker-id');

    // @ts-expect-error - msgIds must be decimal-string array
    client.startTasks('queue', 'flow_slug', [1, 2, 3], 'worker-id');

    // @ts-expect-error - msgIds must be array
    client.startTasks('queue', 'flow_slug', '1', 'worker-id');

    // @ts-expect-error - workerId must be string
    client.startTasks('queue', 'flow_slug', ['1'], 123);
  });
});
