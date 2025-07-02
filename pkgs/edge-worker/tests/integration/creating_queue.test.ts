import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { waitFor } from '../e2e/_helpers.ts';

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
      createFakeLogger
    );

    worker.startOnlyOnce({
      edgeFunctionName: 'test',
      // random uuid
      workerId: crypto.randomUUID(),
    });

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

      assertEquals(
        [...result],
        [{ queue_name: 'custom_queue' }],
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
              AND stopped_at IS NULL
          `;
          return workers[0].count > 0;
        },
        {
          pollIntervalMs: 50,
          timeoutMs: 2000,
          description: 'worker to be registered in pgflow.workers'
        }
      );
    } finally {
      await worker.stop();
    }
  })
);
