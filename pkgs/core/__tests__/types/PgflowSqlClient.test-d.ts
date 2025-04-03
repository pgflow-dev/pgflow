import { describe, it, expectTypeOf } from 'vitest';
import { PgflowSqlClient } from '../../src/PgflowSqlClient.ts';
import type { Json, StepTaskKey } from '../../src/types.ts';
import postgres from 'postgres';
import { Flow } from '@pgflow/dsl';

// Mock the postgres module so that it never makes a real connection.
vi.mock('postgres', () => {
  // Create a properly typed SQL client with methods
  type SqlClient = {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    json: (data: unknown) => string;
    begin: () => Promise<void>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    end: () => Promise<void>;
  };

  // Create the main postgres function that returns the SQL client
  const sql = vi.fn(() => {
    // Create a complete mock SQL client with all required methods
    const sqlClient = Object.assign(
      vi.fn(() => Promise.resolve(['empty response'])),
      {
        json: vi.fn((data: unknown) => JSON.stringify(data)),
        begin: vi.fn(() => Promise.resolve()),
        commit: vi.fn(() => Promise.resolve()),
        rollback: vi.fn(() => Promise.resolve()),
        end: vi.fn(() => Promise.resolve()),
      }
    ) as SqlClient;

    return sqlClient;
  });

  // Return an object with a default key since postgres is imported as a default export
  return { default: sql };
});

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
