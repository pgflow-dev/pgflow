import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { createTestPlatformAdapter } from './_helpers.ts';
import { delay } from '@std/async';
import type { WorkerRow } from '../../src/core/types.ts';

Deno.test(
  'Worker deprecation - should stop polling when deprecated',
  withTransaction(async (sql) => {
    const queueName = `test_queue_${crypto.randomUUID()}`;
    const workerId = crypto.randomUUID();
    const functionName = 'test_deprecation';
    
    // Track how many times poll was called
    let pollCount = 0;
    
    // Create worker with short heartbeat interval for testing
    const logger = createFakeLogger('deprecation-test');
    const worker = createQueueWorker(
      async () => {
        // Message handlers return void
      },
      {
        sql,
        queueName,
        maxPollSeconds: 1,   // 1 second poll interval
        pollIntervalMs: 50   // 50ms between polls
      },
      () => logger,
      createTestPlatformAdapter(sql)
    );

    // Track poll calls through the poller directly
    const poller = (worker as any).batchProcessor.poller;
    const originalPoll = poller.poll.bind(poller);
    poller.poll = async function() {
      pollCount++;
      return originalPoll();
    };

    // Start the worker
    worker.startOnlyOnce({
      edgeFunctionName: functionName,
      workerId,
    });

    // Wait for worker to start and poll a few times
    await delay(300);
    const pollCountBeforeDeprecation = pollCount;
    console.log('Poll count before deprecation:', pollCountBeforeDeprecation);
    
    // Verify worker is registered and running
    const [workerBefore] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE worker_id = ${workerId}::uuid
    `;
    assertEquals(workerBefore.deprecated_at, null);
    assertEquals(workerBefore.function_name, functionName);

    // Mark the worker as deprecated
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${workerId}::uuid
    `;

    // Wait for heartbeat to detect deprecation (heartbeat interval + buffer)
    await delay(200);

    // Record poll count after deprecation
    const pollCountAfterDeprecation = pollCount;
    
    // Wait a bit more to ensure no more polling happens
    await delay(300);
    const finalPollCount = pollCount;

    // Verify worker detected deprecation
    const [workerAfter] = await sql<WorkerRow[]>`
      SELECT * FROM pgflow.workers 
      WHERE worker_id = ${workerId}::uuid
    `;
    
    console.log('Poll count after deprecation:', pollCountAfterDeprecation);
    console.log('Final poll count:', finalPollCount);
    console.log('Worker deprecated_at:', workerAfter.deprecated_at);

    // Assert that polling stopped after deprecation
    assertEquals(workerAfter.deprecated_at !== null, true, 'Worker should be marked as deprecated');
    assertEquals(
      finalPollCount - pollCountAfterDeprecation <= 1, 
      true, 
      `Polling should have stopped after deprecation. Additional polls: ${finalPollCount - pollCountAfterDeprecation}`
    );

    // Clean up
    await worker.stop();
  })
);

Deno.test(
  'Worker deprecation - in-flight messages should complete',
  withTransaction(async (sql) => {
    const queueName = `test_queue_${crypto.randomUUID()}`;
    const workerId = crypto.randomUUID();
    const functionName = 'test_deprecation_inflight';
    
    // Track message processing
    const processedMessages: string[] = [];
    let processingStarted = false;
    let processingCompleted = false;
    
    // Create queue first
    await sql`SELECT pgmq.create(${queueName}::text)`;
    
    // Add test messages to queue
    const message1 = { id: 'msg1', data: 'test1' };
    const message2 = { id: 'msg2', data: 'test2' };
    
    await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify(message1)}::jsonb)`;
    await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify(message2)}::jsonb)`;

    // Create worker that processes messages slowly
    const logger = createFakeLogger('deprecation-test-inflight');
    const worker = createQueueWorker(
      async (message: any) => {
        processingStarted = true;
        // Simulate slow processing
        await delay(200);
        processedMessages.push(message.id);
        processingCompleted = true;
        // Message handlers return void
      },
      {
        sql,
        queueName,
        maxPollSeconds: 1,
        pollIntervalMs: 50,
        maxConcurrent: 2 // Allow concurrent processing
      },
      () => logger,
      createTestPlatformAdapter(sql)
    );

    // Start the worker
    worker.startOnlyOnce({
      edgeFunctionName: functionName,
      workerId,
    });

    // Wait for processing to start
    await delay(100);
    assertEquals(processingStarted, true, 'Processing should have started');

    // Mark the worker as deprecated while it's processing
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${workerId}::uuid
    `;

    // Wait for deprecation to be detected and processing to complete
    await delay(400);

    // Verify that messages were processed even after deprecation
    assertEquals(processingCompleted, true, 'Processing should have completed');
    assertEquals(
      processedMessages.length >= 1, 
      true, 
      `At least one message should have been processed. Processed: ${processedMessages.length}`
    );

    console.log('Processed messages:', processedMessages);

    // Clean up
    await worker.stop();
  })
);

Deno.test(
  'Worker deprecation - multiple workers same function',
  withTransaction(async (sql) => {
    const queueName = `test_queue_${crypto.randomUUID()}`;
    const functionName = 'test_multi_deprecation';
    const workerId1 = crypto.randomUUID();
    const workerId2 = crypto.randomUUID();
    
    // Create two workers
    const logger1 = createFakeLogger('deprecation-worker1');
    const logger2 = createFakeLogger('deprecation-worker2');
    
    const worker1 = createQueueWorker(
      async () => {
        // Message handlers return void
      },
      {
        sql,
        queueName,
        maxPollSeconds: 1,
      },
      () => logger1,
      createTestPlatformAdapter(sql)
    );

    const worker2 = createQueueWorker(
      async () => {
        // Message handlers return void
      },
      {
        sql,
        queueName,
        maxPollSeconds: 1,
      },
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
    assertEquals(workersBefore.length, 2, 'Both workers should be running');

    // Deprecate all workers for this function (simulating deployment)
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE function_name = ${functionName}
        AND deprecated_at IS NULL
    `;

    // Wait for heartbeat detection
    await delay(200);

    // Verify all workers are deprecated
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