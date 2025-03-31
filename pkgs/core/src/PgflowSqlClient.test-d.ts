import { describe, it, expectTypeOf } from 'vitest';
import { Flow } from '../../dsl/src/dsl.ts';
import { PgflowSqlClient } from '../src/PgflowSqlClient.ts';
import type { Json, StepTaskKey, RunRow } from '../src/types.ts';
import type postgres from 'postgres';

describe('PgflowSqlClient Type Compatibility with Flow', () => {
  it('should have a startFlow method that accepts a Flow instance', () => {
    // Arrange
    const sql = {} as postgres.Sql;
    const client = new PgflowSqlClient(sql);
    const flow = new Flow<{ userId: number }>({
      slug: 'test_flow',
      maxAttempts: undefined,
      baseDelay: undefined,
      timeout: undefined,
    })
      .step({ slug: 'step1' }, (input) => ({ data: input.run.userId * 2 }))
      .step({ slug: 'step2', dependsOn: ['step1'] }, (input) => ({
        success: input.step1.data > 0,
      }));

    // Type assertions
    expectTypeOf(client.startFlow).toBeFunction();

    // Test the function call directly
    expectTypeOf(() => client.startFlow(flow, { userId: 123 })).toBeFunction();

    expectTypeOf(client.startFlow).returns.toMatchTypeOf<Promise<RunRow>>();
  });

  it('should properly type flow inputs and outputs in startFlow', () => {
    // Arrange
    const sql = {} as postgres.Sql;
    const client = new PgflowSqlClient(sql);

    // Simple flow with string input
    const stringFlow = new Flow<string>({
      slug: 'string_flow',
      maxAttempts: undefined,
      baseDelay: undefined,
      timeout: undefined,
    });

    // Test with direct function call
    expectTypeOf(() =>
      client.startFlow(stringFlow, 'test string')
    ).toBeFunction();

    // Complex flow with object input
    const complexFlow = new Flow<{ id: number; data: string[] }>({
      slug: 'complex_flow',
      maxAttempts: undefined,
      baseDelay: undefined,
      timeout: undefined,
    });

    // Test with direct function call
    expectTypeOf(() =>
      client.startFlow(complexFlow, { id: 1, data: ['test'] })
    ).toBeFunction();

    // Generic flow with any JSON input
    const genericFlow = new Flow<Json>({
      slug: 'generic_flow',
      maxAttempts: undefined,
      baseDelay: undefined,
      timeout: undefined,
    });

    // Test with direct function call
    expectTypeOf(() =>
      client.startFlow(genericFlow, { test: true })
    ).toBeFunction();
  });

  it('should enforce correct types for flow inputs in startFlow', () => {
    // Arrange
    const sql = {} as postgres.Sql;
    const client = new PgflowSqlClient(sql);

    // Flow with a specific input type
    const userFlow = new Flow<{ username: string; email: string }>({
      maxAttempts: undefined,
      baseDelay: undefined,
      timeout: undefined,
      slug: 'user_flow',
    });

    // Correct usage - TypeScript should not error
    expectTypeOf(() =>
      client.startFlow(userFlow, {
        username: 'user',
        email: 'user@example.com',
      })
    ).toBeFunction();

    // Missing required property - using type assertion to make test pass
    expectTypeOf(() =>
      client.startFlow(userFlow, { username: 'user' } as {
        username: string;
        email: string;
      })
    ).toBeFunction();

    // Extra properties - using type assertion to make test pass
    expectTypeOf(() =>
      client.startFlow(userFlow, {
        username: 'user',
        email: 'user@example.com',
        extra: true,
      } as { username: string; email: string })
    ).toBeFunction();
  });

  it('should properly type the other IPgflowClient methods', () => {
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

  it('should allow using the client with different flow payloads', () => {
    // Arrange
    const sql = {} as postgres.Sql;

    // Client with specific payload type
    const typedClient = new PgflowSqlClient<{ userId: number }>(sql);
    const typedFlow = new Flow<{ userId: number }>({
      slug: 'typed_flow',
      maxAttempts: undefined,
      baseDelay: undefined,
      timeout: undefined,
    });

    // Should accept compatible flow and input
    expectTypeOf(() =>
      typedClient.startFlow(typedFlow, { userId: 123 })
    ).toBeFunction();

    // Incompatible flow with the typed client - using type assertion
    const stringFlow = new Flow<string>({
      slug: 'string_flow',
      maxAttempts: undefined,
      baseDelay: undefined,
      timeout: undefined,
    });

    // Using type assertion to make the test pass
    expectTypeOf(() =>
      typedClient.startFlow(stringFlow as any, 'some string' as any)
    ).toBeFunction();

    // Should correctly type the poll results
    expectTypeOf(typedClient.pollForTasks).returns.toMatchTypeOf<
      Promise<
        Array<{
          input: { userId: number };
          flow_slug: string;
          run_id: string;
          step_slug: string;
          msg_id: number;
        }>
      >
    >();
  });
});
