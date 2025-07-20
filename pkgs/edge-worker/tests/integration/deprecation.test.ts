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
    const queueName = `test_queue_${crypto.randomUUID().replace(/-/g, '_')}`;
    const workerId = crypto.randomUUID();
    const functionName = 'test_deprecation';
    
    // Track processed messages
    const processedMessages: string[] = [];
    
    // Create queue first
    await sql`SELECT pgmq.create(${queueName}::text)`;
    
    // Create worker with message tracking
    const logger = createFakeLogger('deprecation-test');
    const worker = createQueueWorker(
      async (message: unknown, _context: unknown) => {
        console.log('Processing message:', message, typeof message);
        // If message is a string, parse it
        const msg = typeof message === 'string' ? JSON.parse(message) : message as { id: string };
        // Track that we processed this message
        processedMessages.push(msg.id);
        console.log(`Processed message ${msg.id}, total processed: ${processedMessages.length}`);
        // Simulate some work
        await delay(50);
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
    
    // Add first batch of messages
    const firstBatch = ['msg1', 'msg2', 'msg3'];
    for (const msgId of firstBatch) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }
    
    // Wait for processing
    await delay(1000);
    
    // Verify first batch was processed
    console.log('Processed messages:', processedMessages);
    assertEquals(processedMessages.length, 3, 'First batch should be processed');
    assertEquals(processedMessages.sort(), firstBatch.sort(), 'All messages from first batch should be processed');

    // Mark the worker as deprecated
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${workerId}::uuid
    `;

    // Wait for deprecation to be detected (heartbeat interval is 5s)
    console.log('Waiting for deprecation detection...');
    await delay(7000);

    // Check worker state before adding messages
    const workerState = await sql`
      SELECT deprecated_at FROM pgflow.workers WHERE worker_id = ${workerId}::uuid
    `;
    console.log('Worker deprecated_at:', workerState[0]?.deprecated_at);

    // Add second batch of messages after deprecation
    const secondBatch = ['msg4', 'msg5', 'msg6'];
    for (const msgId of secondBatch) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }
    console.log('Added second batch messages');
    
    // Wait to see if these messages get processed (they shouldn't)
    await delay(2000);
    
    // Verify second batch was NOT processed
    console.log('Final processed messages:', processedMessages);
    assertEquals(processedMessages.length, 3, 'No new messages should be processed after deprecation');
    
    // Check both queue and archive tables
    const queueMessages = await sql`
      SELECT msg_id, read_ct, message::text, 'queue' as source 
      FROM ${sql(`pgmq.q_${queueName}`)}
      ORDER BY msg_id
    `;
    
    const archiveMessages = await sql`
      SELECT msg_id, read_ct, message::text, 'archive' as source 
      FROM ${sql(`pgmq.a_${queueName}`)}
      ORDER BY msg_id
    `;
    
    console.log('Messages in queue:', queueMessages);
    console.log('Messages in archive:', archiveMessages);
    
    // Check which messages from second batch are in the queue (unprocessed)
    const unreadMessages = queueMessages.filter((msg) => {
      // Handle double-encoded JSON
      const innerJson = JSON.parse(msg.message);
      const payload = JSON.parse(innerJson);
      return secondBatch.includes(payload.id);
    });
    
    // Check if any second batch messages were incorrectly processed (in archive)
    const incorrectlyProcessed = archiveMessages.filter((msg) => {
      // Handle double-encoded JSON
      const innerJson = JSON.parse(msg.message);
      const payload = JSON.parse(innerJson);
      return secondBatch.includes(payload.id);
    });
    
    assertEquals(incorrectlyProcessed.length, 0, 'No second batch messages should be in archive');
    assertEquals(unreadMessages.length, 3, 'All second batch messages should be in queue');
    for (const msg of unreadMessages) {
      assertEquals(msg.read_ct, 0, `Message should not have been read`);
    }

    // Clean up
    await worker.stop();
  })
);

Deno.test(
  'Worker deprecation - in-flight messages should complete',
  withTransaction(async (sql) => {
    const queueName = `test_queue_${crypto.randomUUID().replace(/-/g, '_')}`;
    const workerId = crypto.randomUUID();
    const functionName = 'test_deprecation_inflight';
    
    // Track message processing stages
    const processingStarted: Set<string> = new Set();
    const processingCompleted: Set<string> = new Set();
    
    // Create queue first
    await sql`SELECT pgmq.create(${queueName}::text)`;
    
    // Create worker that processes messages slowly
    const logger = createFakeLogger('deprecation-test-inflight');
    const worker = createQueueWorker(
      async (message: unknown, _context: unknown) => {
        // If message is a string, parse it
        const msg = typeof message === 'string' ? JSON.parse(message) : message as { id: string };
        processingStarted.add(msg.id);
        // Simulate slow processing
        await delay(2000); // 2 seconds to ensure deprecation happens during processing
        processingCompleted.add(msg.id);
      },
      {
        sql,
        queueName,
        maxPollSeconds: 1,
        pollIntervalMs: 50,
        maxConcurrent: 3 // Allow concurrent processing
      },
      () => logger,
      createTestPlatformAdapter(sql)
    );

    // Start the worker
    worker.startOnlyOnce({
      edgeFunctionName: functionName,
      workerId,
    });

    // Wait for worker to be ready
    await delay(200);
    
    // Add messages that will be in-flight when deprecation happens
    const inflightMessages = ['inflight1', 'inflight2', 'inflight3'];
    for (const msgId of inflightMessages) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }

    // Wait for processing to start
    await delay(300);
    assertEquals(processingStarted.size > 0, true, 'At least one message should have started processing');

    // Mark the worker as deprecated while messages are being processed
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE worker_id = ${workerId}::uuid
    `;

    // Wait for deprecation to be detected
    await delay(6000);

    // Add more messages after deprecation - these should NOT be processed
    const afterDeprecationMessages = ['after1', 'after2'];
    for (const msgId of afterDeprecationMessages) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }

    // Wait for in-flight messages to complete
    await delay(3000);

    // Verify that in-flight messages completed
    console.log('Started processing:', Array.from(processingStarted));
    console.log('Completed processing:', Array.from(processingCompleted));
    
    // All started messages should have completed
    assertEquals(
      processingCompleted.size, 
      processingStarted.size,
      'All messages that started processing should complete'
    );

    // No messages added after deprecation should have been processed
    for (const msgId of afterDeprecationMessages) {
      assertEquals(
        processingStarted.has(msgId),
        false,
        `Message ${msgId} added after deprecation should not be processed`
      );
    }
    
    // Check both queue and archive for after-deprecation messages
    const queueMessages = await sql`
      SELECT msg_id, read_ct, message::text, 'queue' as source 
      FROM ${sql(`pgmq.q_${queueName}`)}
      ORDER BY msg_id
    `;
    
    const archiveMessages = await sql`
      SELECT msg_id, read_ct, message::text, 'archive' as source 
      FROM ${sql(`pgmq.a_${queueName}`)}
      ORDER BY msg_id
    `;
    
    console.log('Queue messages:', queueMessages);
    console.log('Archive messages:', archiveMessages);
    
    // Check if after-deprecation messages are in queue (should be)
    const unreadMessages = queueMessages.filter((msg) => {
      // Handle double-encoded JSON
      const innerJson = JSON.parse(msg.message);
      const payload = JSON.parse(innerJson);
      return afterDeprecationMessages.includes(payload.id);
    });
    
    // Check if after-deprecation messages were processed (should not be)
    const incorrectlyProcessed = archiveMessages.filter((msg) => {
      // Handle double-encoded JSON
      const innerJson = JSON.parse(msg.message);
      const payload = JSON.parse(innerJson);
      return afterDeprecationMessages.includes(payload.id);
    });
    
    console.log('After-deprecation in queue:', unreadMessages.length);
    console.log('After-deprecation in archive:', incorrectlyProcessed.length);
    
    assertEquals(incorrectlyProcessed.length, 0, 'After-deprecation messages should not be in archive');
    assertEquals(unreadMessages.length, afterDeprecationMessages.length, 'After-deprecation messages should be in queue');
    for (const msg of unreadMessages) {
      assertEquals(msg.read_ct, 0, `Message should not have been read`);
    }

    // Clean up
    await worker.stop();
  })
);

Deno.test(
  'Worker deprecation - multiple workers same function',
  withTransaction(async (sql) => {
    const queueName = `test_queue_${crypto.randomUUID().replace(/-/g, '_')}`;
    const functionName = 'test_multi_deprecation';
    const workerId1 = crypto.randomUUID();
    const workerId2 = crypto.randomUUID();
    
    // Track which worker processed which message
    const worker1Messages: string[] = [];
    const worker2Messages: string[] = [];
    
    // Create queue first
    await sql`SELECT pgmq.create(${queueName}::text)`;
    
    // Create two workers that track their messages
    const logger1 = createFakeLogger('deprecation-worker1');
    const logger2 = createFakeLogger('deprecation-worker2');
    
    const worker1 = createQueueWorker(
      async (message: unknown, _context: unknown) => {
        // If message is a string, parse it
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
      async (message: unknown, _context: unknown) => {
        // If message is a string, parse it
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
    const firstBatch = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
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

    // Deprecate all workers for this function (simulating deployment)
    await sql`
      UPDATE pgflow.workers 
      SET deprecated_at = NOW() 
      WHERE function_name = ${functionName}
        AND deprecated_at IS NULL
    `;

    // Wait for heartbeat detection (5s interval + buffer)
    await delay(6000);
    
    // Add more messages after deprecation
    const secondBatch = ['d1', 'd2', 'd3', 'd4'];
    for (const msgId of secondBatch) {
      await sql`SELECT pgmq.send(${queueName}::text, ${JSON.stringify({ id: msgId })}::jsonb)`;
    }
    
    // Wait longer to ensure workers would have polled if they were still active
    await delay(3000);
    
    // Verify no new messages were processed by either worker
    console.log('Worker1 final messages:', worker1Messages);
    console.log('Worker2 final messages:', worker2Messages);
    console.log('Total before deprecation:', totalProcessedBefore);
    console.log('Total after deprecation:', worker1Messages.length + worker2Messages.length);
    
    assertEquals(
      worker1Messages.length + worker2Messages.length,
      totalProcessedBefore,
      'No new messages should be processed after deprecation'
    );
    
    // Check both queue and archive tables
    const queueMessages = await sql`
      SELECT msg_id, read_ct, message::text, 'queue' as source 
      FROM ${sql(`pgmq.q_${queueName}`)}
      ORDER BY msg_id
    `;
    
    const archiveMessages = await sql`
      SELECT msg_id, read_ct, message::text, 'archive' as source 
      FROM ${sql(`pgmq.a_${queueName}`)}
      ORDER BY msg_id
    `;
    
    console.log('Queue messages:', queueMessages);
    console.log('Archive messages:', archiveMessages);
    
    // Check where second batch messages ended up
    const unreadMessages = queueMessages.filter((msg) => {
      // Handle double-encoded JSON
      const innerJson = JSON.parse(msg.message);
      const payload = JSON.parse(innerJson);
      return secondBatch.includes(payload.id);
    });
    
    const processedSecondBatch = archiveMessages.filter((msg) => {
      // Handle double-encoded JSON
      const innerJson = JSON.parse(msg.message);
      const payload = JSON.parse(innerJson);
      return secondBatch.includes(payload.id);
    });
    
    console.log('Second batch in queue:', unreadMessages.length);
    console.log('Second batch in archive:', processedSecondBatch.length);
    
    assertEquals(processedSecondBatch.length, 0, 'Second batch messages should not be processed');
    assertEquals(unreadMessages.length, secondBatch.length, 'All post-deprecation messages should be in queue');
    for (const msg of unreadMessages) {
      assertEquals(msg.read_ct, 0, `Message should not have been read`);
    }

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