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
    const queueName = `test_queue_${crypto.randomUUID().replace(/-/g, '_')}`;
    const workerId = crypto.randomUUID();
    const functionName = 'test_deprecation_simple';
    
    // Create queue first
    await sql`SELECT pgmq.create(${queueName}::text)`;
    
    // Track processed messages
    const processedMessages: string[] = [];
    
    // Create a simple worker
    const logger = createFakeLogger('deprecation-test');
    const worker = createQueueWorker(
      async (message: unknown) => {
        const msg = typeof message === 'string' ? JSON.parse(message) : message as { id: string };
        processedMessages.push(msg.id);
        await delay(50); // Simulate some work
      },
      {
        sql,
        queueName,
        maxPollSeconds: 1,
        pollIntervalMs: 100,
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

    // Add first batch of messages
    const firstBatch = ['simple1', 'simple2'];
    for (const msgId of firstBatch) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }
    
    // Wait for processing
    await delay(500);
    
    // Verify first batch was processed
    assertEquals(processedMessages.length, 2, 'First batch should be processed');
    assertEquals(processedMessages.sort(), firstBatch.sort(), 'All messages from first batch should be processed');

    // Mark the worker as deprecated
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${workerId}::uuid
    `;

    // Wait for heartbeat to detect deprecation (heartbeat interval is 5 seconds)
    console.log('Waiting for heartbeat to detect deprecation...');
    await delay(6000);

    // Add second batch of messages after deprecation
    const secondBatch = ['simple3', 'simple4'];
    for (const msgId of secondBatch) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }
    
    // Wait to see if these messages get processed (they shouldn't)
    await delay(2000);
    
    // Verify second batch was NOT processed
    assertEquals(processedMessages.length, 2, 'No new messages should be processed after deprecation');
    
    // Check queue and archive tables
    const queueMessages = await sql`
      SELECT COUNT(*) as count FROM ${sql(`pgmq.q_${queueName}`)}
    `;
    
    const archiveMessages = await sql`
      SELECT COUNT(*) as count FROM ${sql(`pgmq.a_${queueName}`)}
    `;
    
    console.log(`Queue count: ${queueMessages[0].count}, Archive count: ${archiveMessages[0].count}`);
    
    // First batch should be in archive, second batch should be in queue
    assertEquals(Number(archiveMessages[0].count), 2, 'First batch should be archived');
    assertEquals(Number(queueMessages[0].count), 2, 'Second batch should still be in queue');

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
    const queueName = `test_queue_${crypto.randomUUID().replace(/-/g, '_')}`;
    const functionName = 'test_multi_deprecation_simple';
    const workerId1 = crypto.randomUUID();
    const workerId2 = crypto.randomUUID();
    
    // Create queue first
    await sql`SELECT pgmq.create(${queueName}::text)`;
    
    // Track which worker processed which message
    const worker1Messages: string[] = [];
    const worker2Messages: string[] = [];
    
    // Create two workers for the same function
    const logger1 = createFakeLogger('worker1');
    const logger2 = createFakeLogger('worker2');
    
    const worker1 = createQueueWorker(
      async (message: unknown) => {
        const msg = typeof message === 'string' ? JSON.parse(message) : message as { id: string };
        worker1Messages.push(msg.id);
        await delay(100); // Simulate work
      },
      { 
        sql, 
        queueName,
        maxPollSeconds: 1,
        pollIntervalMs: 100,
      },
      () => logger1,
      createTestPlatformAdapter(sql)
    );

    const worker2 = createQueueWorker(
      async (message: unknown) => {
        const msg = typeof message === 'string' ? JSON.parse(message) : message as { id: string };
        worker2Messages.push(msg.id);
        await delay(100); // Simulate work
      },
      { 
        sql, 
        queueName,
        maxPollSeconds: 1,
        pollIntervalMs: 100,
      },
      () => logger2,
      createTestPlatformAdapter(sql)
    );

    // Start both workers
    worker1.startOnlyOnce({ edgeFunctionName: functionName, workerId: workerId1 });
    worker2.startOnlyOnce({ edgeFunctionName: functionName, workerId: workerId2 });

    await delay(300);

    // Verify both workers are running
    const workersBefore = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE function_name = ${functionName}
      AND deprecated_at IS NULL
      ORDER BY worker_id
    `;
    assertEquals(workersBefore.length, 2, 'Both workers should be running');

    // Add messages - they should be distributed between workers
    const firstBatch = ['multi1', 'multi2', 'multi3', 'multi4'];
    for (const msgId of firstBatch) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }
    
    // Wait for processing
    await delay(1000);
    
    // Verify both workers processed some messages
    const totalProcessedBefore = worker1Messages.length + worker2Messages.length;
    assertEquals(totalProcessedBefore, firstBatch.length, 'All messages should be processed');
    assertEquals(worker1Messages.length > 0, true, 'Worker 1 should have processed some messages');
    assertEquals(worker2Messages.length > 0, true, 'Worker 2 should have processed some messages');
    
    console.log('Worker1 processed:', worker1Messages);
    console.log('Worker2 processed:', worker2Messages);

    // Check initial archive count
    const archiveCountBefore = await sql`
      SELECT COUNT(*) as count FROM ${sql(`pgmq.a_${queueName}`)}
    `;
    assertEquals(Number(archiveCountBefore[0].count), firstBatch.length, 'First batch should be archived');

    // Deprecate all workers for this function (simulating deployment)
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE function_name = ${functionName}
        AND deprecated_at IS NULL
    `;

    // Wait for heartbeat detection (5s interval + buffer)
    console.log('Waiting for all workers to detect deprecation...');
    await delay(6000);
    
    // Add more messages after deprecation
    const secondBatch = ['multi5', 'multi6', 'multi7', 'multi8'];
    for (const msgId of secondBatch) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }
    
    // Wait longer to ensure workers would have polled if they were still active
    await delay(3000);
    
    // Verify no new messages were processed by either worker
    const totalProcessedAfter = worker1Messages.length + worker2Messages.length;
    assertEquals(
      totalProcessedAfter,
      totalProcessedBefore,
      'No new messages should be processed after deprecation'
    );
    
    // Check queue and archive counts
    const queueCount = await sql`
      SELECT COUNT(*) as count FROM ${sql(`pgmq.q_${queueName}`)}
    `;
    
    const archiveCountAfter = await sql`
      SELECT COUNT(*) as count FROM ${sql(`pgmq.a_${queueName}`)}
    `;
    
    console.log(`Queue count: ${queueCount[0].count}, Archive count: ${archiveCountAfter[0].count}`);
    
    // Second batch should still be in queue
    assertEquals(Number(queueCount[0].count), secondBatch.length, 'Second batch should be in queue');
    assertEquals(Number(archiveCountAfter[0].count), firstBatch.length, 'Only first batch should be archived');

    // Verify all workers are marked as deprecated
    const workersAfter = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE function_name = ${functionName}
      AND deprecated_at IS NOT NULL
      ORDER BY worker_id
    `;
    assertEquals(workersAfter.length, 2, 'Both workers should be deprecated');

    // Clean up
    await worker1.stop();
    await worker2.stop();
  })
);