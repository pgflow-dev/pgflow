import { assertEquals } from '@std/assert';
import { Queries } from '../../src/core/Queries.ts';
import type { postgres } from '../sql.ts';

// Mock SQL client that captures the SQL template string and values
function createMockSql() {
  const calls: { query: string; values: unknown[] }[] = [];

  const mockSql = ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const query = strings.join('?');
    calls.push({ query, values });
    return Promise.resolve([]);
  }) as unknown as postgres.Sql;

  return { mockSql, calls };
}

Deno.test('Queries.trackWorkerFunction - calls correct SQL function', async () => {
  const { mockSql, calls } = createMockSql();
  const queries = new Queries(mockSql);

  await queries.trackWorkerFunction('my-edge-function');

  assertEquals(calls.length, 1);
  assertEquals(calls[0].values, ['my-edge-function']);
  // Check that query references the correct function
  assertEquals(calls[0].query.includes('pgflow.track_worker_function'), true);
});

Deno.test('Queries.trackWorkerFunction - handles special characters in function name', async () => {
  const { mockSql, calls } = createMockSql();
  const queries = new Queries(mockSql);

  await queries.trackWorkerFunction('my_function-with-special_chars');

  assertEquals(calls.length, 1);
  assertEquals(calls[0].values, ['my_function-with-special_chars']);
});

Deno.test('Queries.markWorkerStopped - calls correct SQL function', async () => {
  const { mockSql, calls } = createMockSql();
  const queries = new Queries(mockSql);

  const workerId = '550e8400-e29b-41d4-a716-446655440000';
  await queries.markWorkerStopped(workerId);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].values, [workerId]);
  // Check that query references the correct function
  assertEquals(calls[0].query.includes('pgflow.mark_worker_stopped'), true);
});

Deno.test('Queries.markWorkerStopped - handles different UUID formats', async () => {
  const { mockSql, calls } = createMockSql();
  const queries = new Queries(mockSql);

  const workerId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  await queries.markWorkerStopped(workerId);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].values, [workerId]);
});
