import { assertEquals, assertExists, assertRejects } from 'jsr:@std/assert';
import { Queries } from '../../src/Queries.ts';
import { withSql } from '../sql.ts';
import { WorkerRow } from '../../src/types.ts';

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

Deno.test(
  'Queries.sendHeartbeat updates last_heartbeat_at for started worker',
  () =>
    withSql(async (sql) => {
      const queries = new Queries(sql);

      // First create a worker
      const params = {
        queueName: 'test_queue',
        workerId: '123e4567-e89b-12d3-a456-426614174000',
        edgeFunctionName: 'test_function',
      };

      const worker = await queries.onWorkerStarted(params);
      const initialHeartbeat = worker.last_heartbeat_at;

      // Wait a bit to ensure timestamp will be different
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Send heartbeat
      await queries.sendHeartbeat(worker);

      // Verify in database directly
      const [updatedWorkerRow] = await sql<[WorkerRow]>`
        SELECT * FROM edge_worker.workers 
        WHERE worker_id = ${params.workerId} 
        AND queue_name = ${params.queueName}
      `;

      assertExists(updatedWorkerRow.last_heartbeat_at);
      assertEquals(
        updatedWorkerRow.last_heartbeat_at > initialHeartbeat,
        true,
        'last_heartbeat_at in database should be updated to a later time'
      );
    })
);
