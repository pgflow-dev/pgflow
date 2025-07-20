import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { createTestPlatformAdapter } from './_helpers.ts';
import { delay } from '@std/async';
import type { WorkerRow } from '../../src/core/types.ts';

Deno.test(
  'Worker deprecation - heartbeat detects deprecation and transitions state',
  withTransaction(async (sql) => {
    const queueName = `test_queue_${crypto.randomUUID()}`;
    const workerId = crypto.randomUUID();
    const functionName = 'test_deprecation_simple';
    
    // Create a simple worker
    const logger = createFakeLogger('deprecation-test');
    const worker = createQueueWorker(
      async () => {
        // Simple handler
      },
      {
        sql,
        queueName,
      },
      () => logger,
      createTestPlatformAdapter(sql)
    );

    // Start the worker
    worker.startOnlyOnce({
      edgeFunctionName: functionName,
      workerId,
    });

    // Wait for worker to start
    await delay(200);
    
    // Verify worker is registered and not deprecated
    const [workerBefore] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE worker_id = ${workerId}::uuid
    `;
    assertEquals(workerBefore.deprecated_at, null);
    assertEquals(workerBefore.function_name, functionName);

    // Get the lifecycle to check state
    const lifecycle = (worker as any).lifecycle;
    assertEquals(lifecycle.isRunning, true);
    assertEquals(lifecycle.isDeprecated, false);

    // Mark the worker as deprecated
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${workerId}::uuid
    `;

    // Wait for next heartbeat (default is 5 seconds, so wait a bit more)
    await delay(5500);

    // Check that worker detected deprecation
    assertEquals(lifecycle.isDeprecated, true);
    assertEquals(lifecycle.isRunning, false);

    // Verify worker record shows deprecation
    const [workerAfter] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE worker_id = ${workerId}::uuid
    `;
    assertEquals(workerAfter.deprecated_at !== null, true);

    // Clean up
    await worker.stop();
  })
);

Deno.test(
  'Worker deprecation - deprecated workers for same function',
  withTransaction(async (sql) => {
    const queueName = `test_queue_${crypto.randomUUID()}`;
    const functionName = 'test_multi_deprecation_simple';
    const workerId1 = crypto.randomUUID();
    const workerId2 = crypto.randomUUID();
    
    // Create two workers for the same function
    const logger1 = createFakeLogger('worker1');
    const logger2 = createFakeLogger('worker2');
    
    const worker1 = createQueueWorker(
      async () => {},
      { sql, queueName },
      () => logger1,
      createTestPlatformAdapter(sql)
    );

    const worker2 = createQueueWorker(
      async () => {},
      { sql, queueName },
      () => logger2,
      createTestPlatformAdapter(sql)
    );

    // Start both workers
    worker1.startOnlyOnce({ edgeFunctionName: functionName, workerId: workerId1 });
    worker2.startOnlyOnce({ edgeFunctionName: functionName, workerId: workerId2 });

    await delay(200);

    // Verify both workers are running
    const workersBefore = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE function_name = ${functionName}
      AND deprecated_at IS NULL
      ORDER BY worker_id
    `;
    assertEquals(workersBefore.length, 2);

    // Deprecate all workers for this function (simulating deployment)
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE function_name = ${functionName}
        AND deprecated_at IS NULL
    `;

    // Wait for heartbeat detection (need to ensure both workers get a heartbeat)
    // Heartbeat interval is 5 seconds, but we need to account for when each worker
    // sends its first heartbeat. Let's wait for up to 12 seconds total to ensure
    // both workers have had at least 2 heartbeat intervals
    const maxWaitTime = 12000;
    const checkInterval = 500;
    let elapsed = 0;
    
    const lifecycle1 = (worker1 as any).lifecycle;
    const lifecycle2 = (worker2 as any).lifecycle;
    
    // Wait until both workers are deprecated or timeout
    while (elapsed < maxWaitTime && (!lifecycle1.isDeprecated || !lifecycle2.isDeprecated)) {
      await delay(checkInterval);
      elapsed += checkInterval;
    }
    
    // Now check that both detected deprecation
    assertEquals(lifecycle1.isDeprecated, true, 'Worker 1 should be deprecated');
    assertEquals(lifecycle2.isDeprecated, true, 'Worker 2 should be deprecated');

    // Verify all workers are marked as deprecated
    const workersAfter = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE function_name = ${functionName}
      AND deprecated_at IS NOT NULL
      ORDER BY worker_id
    `;
    assertEquals(workersAfter.length, 2);

    // Clean up
    await worker1.stop();
    await worker2.stop();
  })
);