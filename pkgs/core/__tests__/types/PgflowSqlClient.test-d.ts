import { describe, it, expectTypeOf, vi, beforeEach } from 'vitest';
import { setupPostgresMock } from '../mocks/postgres.ts';

// Mock the postgres module so that it never makes a real connection.
// This must come before the postgres import
vi.mock('postgres', () => {
  return setupPostgresMock();
});

import { PgflowSqlClient } from '../../src/PgflowSqlClient.ts';
import type { Json, StepTaskKey } from '../../src/types.ts';
import postgres from 'postgres';
import { Flow } from '@pgflow/dsl';

describe('PgflowSqlClient Type Compatibility with Flow', () => {
  let mockSql: ReturnType<typeof postgres>;

  beforeEach(() => {
    // Clear all mock instances before each test
    vi.clearAllMocks();
    mockSql = postgres();
  });

  it('should properly type IPgflowClient methods', () => {
    // Arrange
    const sql = postgres();
    const flow = new Flow<{ url: string }>({ slug: 'test_flow' });
    const client = new PgflowSqlClient<typeof flow>(sql);

    // Check pollForTasks method types
    expectTypeOf(client.pollForTasks).toBeFunction();
    expectTypeOf(client.pollForTasks).parameters.toMatchTypeOf<
      [string, number?, number?, number?, number?]
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
});
