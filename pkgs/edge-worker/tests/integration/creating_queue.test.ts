import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { waitFor } from '../e2e/_helpers.ts';
import { delay } from '@std/async';
import { createTestPlatformAdapter } from './_helpers.ts';

Deno.test(
  'creates queue when starting worker',
  withTransaction(async (sql) => {
    const worker = createQueueWorker(
      console.log,
      {
        sql,
        maxPollSeconds: 1,
        queueName: 'custom_queue',
      },
      createFakeLogger,
      createTestPlatformAdapter(sql)
    );

    worker.startOnlyOnce({
      edgeFunctionName: 'test',
      // random uuid
      workerId: crypto.randomUUID(),
    });
    
    // Wait a bit to ensure worker transitions through starting to running
    await delay(100);

    try {
      // Wait for the queue to be created
      const result = await waitFor(
        async () => {
          const queues: { queue_name: string }[] =
            await sql`select queue_name from pgmq.list_queues();`;
          
          const queueExists = queues.some(q => q.queue_name === 'custom_queue');
          return queueExists ? queues : false;
        },
        {
          pollIntervalMs: 50,
          timeoutMs: 5000,
          description: 'queue "custom_queue" to be created'
        }
      );

      // Check that custom_queue was created
      const customQueueExists = result.some(q => q.queue_name === 'custom_queue');
      assertEquals(
        customQueueExists,
        true,
        'queue "custom_queue" was created'
      );

      // Also wait for worker to be registered in pgflow.workers table
      // This ensures the worker has fully transitioned to running state
      await waitFor(
        async () => {
          const workers = await sql`
            SELECT COUNT(*) as count 
            FROM pgflow.workers 
            WHERE function_name = 'test' 
              AND deprecated_at IS NULL
          `;
          return workers[0].count > 0;
        },
        {
          pollIntervalMs: 50,
          timeoutMs: 2000,
          description: 'worker to be registered in pgflow.workers'
        }
      );
      
      // Give the worker a bit more time to fully transition to running state
      // This prevents the "Cannot transition from starting to stopping" error
      await new Promise(resolve => setTimeout(resolve, 100));
    } finally {
      await worker.stop();
    }
  })
);
