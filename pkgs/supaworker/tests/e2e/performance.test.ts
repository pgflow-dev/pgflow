import { sql } from '../sql.ts';
import {
  waitFor,
  sendBatch,
  waitForSeqToIncrementBy,
  startWorker,
  log,
  waitForBatchArchiver,
} from './_helpers.ts';

const MESSAGES_TO_SEND = 20000;
const WORKER_NAME = 'max_concurrency';

Deno.test(
  'worker can handle tens of thousands of jobs queued at once',
  async () => {
    await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
    await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
    await sql`SELECT pgmq.create(${WORKER_NAME})`;
    await sql`SELECT pgmq.drop_queue(${WORKER_NAME})`;
    await sql`SELECT pgmq.create(${WORKER_NAME})`;
    await startWorker(WORKER_NAME);
    await waitFor(
      async () => {
        const [{ worker_count }] = await sql`
        SELECT COUNT(*)::integer AS worker_count
        FROM supaworker.active_workers 
        WHERE edge_fn_name = ${WORKER_NAME}
      `;

        log('worker_count', worker_count);
        return worker_count === 1;
      },
      { description: 'Waiting for exacly one worker' }
    );

    try {
      // worker sleeps for 1s for each message
      // se we will expect roughly 1 message per second
      const startTime = Date.now();

      await sendBatch(MESSAGES_TO_SEND, WORKER_NAME);
      await waitForSeqToIncrementBy(MESSAGES_TO_SEND, {
        timeoutMs: MESSAGES_TO_SEND * 1000 + 1000,
        pollIntervalMs: 1000,
      });
      await waitForBatchArchiver();

      const endTime = Date.now();
      const totalMs = Math.round(endTime - startTime);
      const totalS = totalMs / 1000;
      const msgsPerSecond = MESSAGES_TO_SEND / totalS;

      log('');
      log('');
      log(`Total time:`, totalMs);
      log(`msgs/second:`, msgsPerSecond);
    } finally {
      await sql.end();
    }
  }
);
