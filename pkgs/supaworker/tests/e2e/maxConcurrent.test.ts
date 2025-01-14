import { sql } from '../sql.ts';
import { assertGreaterOrEqual } from 'jsr:@std/assert';
import {
  waitFor,
  sendBatch,
  waitForSeqToIncrementBy,
  startWorker,
  log,
  waitForBatchArchiver,
} from './_helpers.ts';

const MESSAGES_TO_SEND = 5;
const WORKER_NAME = 'serial_sleep';

Deno.test('worker respect maxConcurrent settings', async () => {
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
    });
    await waitForBatchArchiver();

    const endTime = Date.now();
    const totalMs = Math.round(endTime - startTime);

    assertGreaterOrEqual(
      totalMs,
      (MESSAGES_TO_SEND - 1) * 1000,
      `Should take at least ${MESSAGES_TO_SEND}s to process all messages, took ${totalMs}ms instead`
    );
  } finally {
    await sql.end();
  }
});
