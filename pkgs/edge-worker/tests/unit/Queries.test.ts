import { assertEquals, assertExists, assertRejects } from 'jsr:@std/assert';
import { Queries } from '../../src/Queries.ts';
import { withTransaction, withPgNoTransaction } from '../db.ts';
import { WorkerRow } from '../../src/types.ts';
import { delay } from '@std/async';

const FAKE_UUID = '123e4567-e89b-12d3-a456-426614174000';

Deno.test(
  'Queries.onWorkerStarted integration test',
  withTransaction(async (sql) => {
    await sql`TRUNCATE edge_worker.workers CASCADE`;
    const queries = new Queries(sql);
    // Test data
    const queueName = 'test_queue';
    const workerId = FAKE_UUID;
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
  })
);

Deno.test(
  'Queries.onWorkerStarted throws on duplicate worker',
  withPgNoTransaction(async (sql) => {
    await sql`TRUNCATE edge_worker.workers CASCADE`;

    try {
      const queries = new Queries(sql);

      const params = {
        queueName: 'test_queue',
        workerId: FAKE_UUID,
        edgeFunctionName: 'test_function',
      };

      // First call should succeed
      console.log('aaaa');
      const result = await queries.onWorkerStarted(params);
      assertExists(result);
      console.log('bbb');

      // Second call with same params should throw
      await assertRejects(
        async () => {
          await queries.onWorkerStarted(params);
        },
        Error,
        'duplicate key value violates unique constraint'
      );
      console.log('eeee');
    } finally {
      await sql`TRUNCATE edge_worker.workers CASCADE`;
    }
  })
);

Deno.test(
  'Queries.sendHeartbeat updates last_heartbeat_at for started worker',
  withTransaction(async (sql) => {
    const queries = new Queries(sql);

    // First create a worker
    const params = {
      queueName: 'test_queue',
      workerId: FAKE_UUID,
      edgeFunctionName: 'test_function',
    };

    const worker = await queries.onWorkerStarted(params);
    const initialHeartbeat = worker.last_heartbeat_at;

    // Wait a bit to ensure timestamp will be different
    await delay(1);

    // Send heartbeat
    await queries.sendHeartbeat(worker);

    // Verify in database directly
    const [updatedWorkerRow] = await sql<[WorkerRow]>`
        SELECT * FROM edge_worker.workers
        WHERE worker_id = ${params.workerId}
        AND queue_name = ${params.queueName}
      `;

    // console.log('stats', { initialHeartbeat, updatedWorkerRow });
    assertExists(updatedWorkerRow.last_heartbeat_at);
    assertEquals(
      updatedWorkerRow.last_heartbeat_at > initialHeartbeat,
      true,
      'last_heartbeat_at in database should be updated to a later time'
    );
  })
);

Deno.test(
  'Queries.onWorkerStopped updates stopped_at and last_heartbeat_at',
  withTransaction(async (sql) => {
    await sql`TRUNCATE edge_worker.workers CASCADE`;
    const queries = new Queries(sql);

    // First create a worker
    const params = {
      queueName: 'test_queue',
      workerId: FAKE_UUID,
      edgeFunctionName: 'test_function',
    };

    const worker = await queries.onWorkerStarted(params);
    const initialHeartbeat = worker.last_heartbeat_at;
    assertEquals(
      worker.stopped_at,
      null,
      'stopped_at should be null initially'
    );

    // Wait a bit to ensure timestamp will be different
    await new Promise((resolve) => setTimeout(resolve, 1));

    // Stop the worker
    const stoppedWorker = await queries.onWorkerStopped(worker);

    // Verify returned worker has updated timestamps
    assertExists(stoppedWorker.stopped_at, 'stopped_at should be set');
    assertExists(
      stoppedWorker.last_heartbeat_at,
      'last_heartbeat_at should be set'
    );
    assertEquals(
      stoppedWorker.last_heartbeat_at > initialHeartbeat,
      true,
      'last_heartbeat_at should be updated to a later time'
    );

    // Verify in database directly
    const [workerRow] = await sql<[WorkerRow]>`
      SELECT * FROM edge_worker.workers
      WHERE worker_id = ${params.workerId}
      AND queue_name = ${params.queueName}
    `;

    assertExists(workerRow.stopped_at, 'stopped_at should be set in database');
    assertEquals(
      workerRow.last_heartbeat_at > initialHeartbeat,
      true,
      'last_heartbeat_at in database should be updated to a later time'
    );
    assertEquals(
      workerRow.stopped_at,
      stoppedWorker.stopped_at,
      'stopped_at should match between API response and database'
    );
  })
);
