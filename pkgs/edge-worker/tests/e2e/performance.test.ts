import { withSql, createSql } from '../sql.ts';
import {
  waitFor,
  sendBatch,
  waitForSeqToIncrementBy,
  startWorker,
  log,
} from './_helpers.ts';

const MESSAGES_TO_SEND = 20000;
const WORKER_NAME = 'max_concurrency';

Deno.test(
  {
    name: 'worker can handle tens of thousands of jobs queued at once',
    sanitizeOps: false, // Progress bar uses async writes that don't complete before test ends
    sanitizeResources: false,
  },
  async () => {
    await withSql(async (sql) => {
      await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
      await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
      await sql`SELECT pgmq.create(${WORKER_NAME})`;
      await sql`SELECT pgmq.drop_queue(${WORKER_NAME})`;
      await sql`SELECT pgmq.create(${WORKER_NAME})`;
      await startWorker(WORKER_NAME);
      await waitFor(
        async () => {
          const tempSql = createSql();
          try {
            const [{ worker_count }] = await tempSql`
            SELECT COUNT(*)::integer AS worker_count
            FROM pgflow.workers
            WHERE function_name = ${WORKER_NAME}
              AND last_heartbeat_at >= NOW() - INTERVAL '6 seconds'
          `;

            log('worker_count', worker_count);
            return worker_count === 1;
          } finally {
            await tempSql.end();
          }
        },
        { description: 'Waiting for exacly one worker' }
      );

      // worker sleeps for 1s for each message
      // se we will expect roughly 1 message per second
      const startTime = Date.now();

      await sendBatch(MESSAGES_TO_SEND, WORKER_NAME);
      await waitForSeqToIncrementBy(MESSAGES_TO_SEND, {
        timeoutMs: MESSAGES_TO_SEND * 1000 + 1000,
        pollIntervalMs: 1000,
      });

      const endTime = Date.now();
      const totalMs = Math.round(endTime - startTime);
      const totalS = totalMs / 1000;
      const msgsPerSecond = MESSAGES_TO_SEND / totalS;

      log('');
      log('');
      log(`Total time:`, totalMs);
      log(`msgs/second:`, msgsPerSecond);
    });
  }
);
