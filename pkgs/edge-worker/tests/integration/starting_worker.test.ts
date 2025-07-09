import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { createAdapter } from '../../src/platform/createAdapter.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { delay } from '@std/async';

Deno.test(
  'Starting worker',
  withTransaction(async (sql) => {
    const worker = createQueueWorker(
      console.log,
      {
        sql,
        maxPollSeconds: 1,
      },
      createFakeLogger,
      createAdapter()
    );

    worker.startOnlyOnce({
      edgeFunctionName: 'test',
      // random uuid
      workerId: crypto.randomUUID(),
    });

    await delay(100);

    try {
      const workers = await sql`select * from pgflow.workers`;

      console.log(workers);
    } finally {
      await worker.stop();
    }
  })
);

Deno.test(
  'check pgmq version',
  withTransaction(async (sql) => {
    const result = await sql`
    SELECT extversion
    FROM pg_extension
    WHERE extname = 'pgmq'
  `;
    console.log('pgmq version:', result);
  })
);
