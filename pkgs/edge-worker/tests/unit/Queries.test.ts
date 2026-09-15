import { assertEquals } from '@std/assert';
import { Queries } from '../../src/core/Queries.ts';
import type { WorkerRow } from '../../src/core/types.ts';
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

Deno.test('Queries.trackWorkerFunction - keeps explicit HTTP mode compatible with old databases', async () => {
  const { mockSql, calls } = createMockSql();
  const queries = new Queries(mockSql);

  await queries.trackWorkerFunction('http-worker', 'http');

  assertEquals(calls.length, 1);
  assertEquals(calls[0].values, ['http-worker']);
});

Deno.test('Queries.trackWorkerFunction - passes explicit process start mode', async () => {
  const { mockSql, calls } = createMockSql();
  const queries = new Queries(mockSql);

  await queries.trackWorkerFunction('process-worker', 'process');

  assertEquals(calls.length, 1);
  assertEquals(calls[0].values, ['process-worker', 'process']);
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

Deno.test('Queries.sendHeartbeat treats missing worker row as deprecated', async () => {
  const sql = (() => Promise.resolve([])) as unknown as postgres.Sql;
  const queries = new Queries(sql);
  const workerRow: WorkerRow = {
    worker_id: '00000000-0000-0000-0000-000000000001',
    function_name: 'test_worker',
    queue_name: 'test_worker',
    started_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
    deprecated_at: null,
  };

  const result = await queries.sendHeartbeat(workerRow);

  assertEquals(result.is_deprecated, true);
});

// Mock SQL that also supports the .json() helper used by ensureFlowCompiled
function createMockSqlWithJson() {
  const calls: { query: string; values: unknown[] }[] = [];

  const mockSql = ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    calls.push({ query: strings.join('?'), values });
    return Promise.resolve([{ result: { status: 'verified', differences: [] } }]);
  }) as unknown as postgres.Sql;

  (mockSql as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;

  return { mockSql, calls };
}

Deno.test('Queries.ensureFlowCompiled - sends shape, queue mode, and complete route map', async () => {
  const { mockSql, calls } = createMockSqlWithJson();
  const queries = new Queries(mockSql);

  const shape = {
    steps: [{ slug: 'classify', stepType: 'single', dependencies: [] }],
  } as never;

  await queries.ensureFlowCompiled('communityThreadsV1', shape, 'step', [
    { stepSlug: 'classify', stepIndex: 0, queueName: 'communitythreadsv1__classify' },
  ]);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].query.includes('pgflow.ensure_flow_compiled'), true);
  // Ordered arguments: slug, shape, mode, routes
  assertEquals(calls[0].values[0], 'communityThreadsV1');
  assertEquals(calls[0].values[1], shape);
  assertEquals(calls[0].values[2], 'step');
  assertEquals(calls[0].values[3], [
    { stepSlug: 'classify', queueName: 'communitythreadsv1__classify' },
  ]);
});

Deno.test('Queries.ensureFlowCompiled - defaults to flow mode without routes', async () => {
  const { mockSql, calls } = createMockSqlWithJson();
  const queries = new Queries(mockSql);

  await queries.ensureFlowCompiled('plainFlow', { steps: [] } as never);

  assertEquals(calls[0].values[2], 'flow');
  assertEquals(calls[0].values[3], null);
});
