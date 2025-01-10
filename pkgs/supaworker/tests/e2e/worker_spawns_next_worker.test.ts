import { sql } from '../sql.ts';
import {
  assertEquals,
  assertGreater,
  assertGreaterOrEqual,
} from 'jsr:@std/assert';
import {
  fetchWorkers,
  sendBatch,
  startWorker,
  waitForSeqToIncrementBy,
} from './_helpers.ts';

const WORKER_NAME = 'increment-sequence';
const MESSAGES_TO_SEND = 3000;

Deno.test('should spawn next worker when CPU clock limit hits', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM pgmq.q_pgflow`;
  await sql`DELETE FROM pgmq.a_pgflow`;
  await sql`
    DELETE FROM supaworker.workers 
    WHERE worker_id IN (
      SELECT worker_id 
      FROM supaworker.inactive_workers
    )`;
  await startWorker(WORKER_NAME);

  try {
    await sendBatch(MESSAGES_TO_SEND);

    const lastVal = await waitForSeqToIncrementBy(MESSAGES_TO_SEND, {
      timeoutMs: 45000,
    });

    assertGreaterOrEqual(
      lastVal,
      MESSAGES_TO_SEND,
      'Sequence value should be greater than or equal to the number of messages sent'
    );

    const queue = await sql`SELECT * FROM pgmq.q_pgflow`;
    const archive = await sql`SELECT * FROM pgmq.a_pgflow`;
    assertEquals(queue.length, 0, 'queue should be empty');
    assertEquals(
      archive.length,
      MESSAGES_TO_SEND,
      `archive should have all ${MESSAGES_TO_SEND} messages`
    );

    const workers = await fetchWorkers(WORKER_NAME);
    assertGreater(
      workers.length,
      1,
      'expected worker to spawn another but there is only 1 worker'
    );
  } finally {
    await sql.end();
  }
});
