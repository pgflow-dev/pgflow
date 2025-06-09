import { describe, it, expectTypeOf, vi, beforeEach } from 'vitest';
import { setupPostgresMock } from '../mocks/postgres.js';

// Mock the postgres module so that it never makes a real connection.
// This must come before the postgres import
vi.mock('postgres', () => {
  return setupPostgresMock();
});

import { PgflowSqlClient } from '../../src/PgflowSqlClient.js';
import type { Json, StepTaskKey, StepTaskRecord } from '../../src/types.js';
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
      [string, number[], string]
    >();
    expectTypeOf(client.startTasks).returns.toEqualTypeOf<
      Promise<StepTaskRecord<typeof flow>[]>
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

  it('should properly type startTasks method parameters', () => {
    const sql = postgres();
    const flow = new Flow<{ url: string }>({ slug: 'test_flow' });
    const client = new PgflowSqlClient<typeof flow>(sql);

    // Valid calls should compile
    client.startTasks('flow_slug', [1, 2, 3], 'worker-id');
    client.startTasks('flow_slug', [], 'worker-id');

    // @ts-expect-error - flowSlug must be string
    client.startTasks(123, [1, 2, 3], 'worker-id');

    // @ts-expect-error - msgIds must be number array
    client.startTasks('flow_slug', ['1', '2', '3'], 'worker-id');

    // @ts-expect-error - msgIds must be array
    client.startTasks('flow_slug', 123, 'worker-id');

    // @ts-expect-error - workerId must be string
    client.startTasks('flow_slug', [1, 2, 3], 123);
  });
});
