import { assertEquals } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { delay } from '@std/async';

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

    await delay(100);

    try {
      const result: { queue_name: string }[] =
        await sql`select queue_name from pgmq.list_queues();`;

      assertEquals(
        [...result],
        [{ queue_name: 'custom_queue' }],
        'queue "custom_queue" was created'
      );
    } finally {
      await worker.stop();
    }
  })
);
