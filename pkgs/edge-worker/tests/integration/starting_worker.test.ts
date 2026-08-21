import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { createTestPlatformAdapter } from './_helpers.ts';

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
      createTestPlatformAdapter(sql)
    );

    await worker.startOnlyOnce({
      edgeFunctionName: 'test',
      // random uuid
      workerId: crypto.randomUUID(),
    });

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
