import { describe, it, expectTypeOf } from 'vitest';
import { PgflowSqlClient } from '../src/PgflowSqlClient.ts';
import type { Json, StepTaskKey } from '../src/types.ts';
import type postgres from 'postgres';

describe('PgflowSqlClient Type Compatibility with Flow', () => {
  it('should properly type IPgflowClient methods', () => {
    // Arrange
    const sql = {} as postgres.Sql;
    const client = new PgflowSqlClient(sql);

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
});
