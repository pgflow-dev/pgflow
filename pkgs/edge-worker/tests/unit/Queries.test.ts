import { assertEquals, assertExists, assertRejects } from 'jsr:@std/assert';
import { Queries } from '../../src/Queries.ts';
import { withSql } from '../sql.ts';

Deno.test('Queries.onWorkerStarted integration test', async () => {
  await withSql(async (sql) => {
    const queries = new Queries(sql);
    // Test data
    const queueName = 'test_queue';
    const workerId = '123e4567-e89b-12d3-a456-426614174000';
    const edgeFunctionName = 'test_function';

    // Execute the method
    const result = await queries.onWorkerStarted({
      queueName,
      workerId,
      edgeFunctionName,
    });

    // Assertions
    assertExists(result, 'Result should not be null');
    assertEquals(result.worker_id, workerId);
    assertEquals(result.queue_name, queueName);
    assertEquals(result.function_name, edgeFunctionName);
    assertExists(result.started_at, 'started_at should be set');
    assertEquals(result.stopped_at, null);
  });
});

Deno.test('Queries.onWorkerStarted throws on duplicate worker', async () => {
  await withSql(async (sql) => {
    const queries = new Queries(sql);

    const params = {
      queueName: 'test_queue',
      workerId: '123e4567-e89b-12d3-a456-426614174000',
      edgeFunctionName: 'test_function',
    };

    // First call should succeed
    const result = await queries.onWorkerStarted(params);
    assertExists(result);

    // Second call with same params should throw
    await assertRejects(
      async () => {
        await queries.onWorkerStarted(params);
      },
      Error,
      'duplicate key value violates unique constraint'
    );
  });
});
