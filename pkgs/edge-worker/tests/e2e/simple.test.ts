import { sql } from '../sql.ts';
import { assertEquals } from '@std/assert';
import {
  log,
  startWorker,
  waitForBatchArchiver,
  waitForSeqToIncrementBy,
} from './_helpers.ts';
import { sendBatch } from './_helpers.ts';

const WORKER_NAME = 'increment_sequence';

Deno.test('simple processing works', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`SELECT pgmq.create(${WORKER_NAME})`;
  await sql`SELECT pgmq.drop_queue(${WORKER_NAME})`;
  await sql`SELECT pgmq.create(${WORKER_NAME})`;
  await startWorker(WORKER_NAME);

  try {
    await sendBatch(6, WORKER_NAME);

    await waitForSeqToIncrementBy(6);
    await waitForBatchArchiver();

    const queue = await sql`SELECT * FROM pgmq.q_increment_sequence`;
    log('queue', queue);
    assertEquals(queue.length, 0, 'queue should be empty');

    const archive = await sql`SELECT * FROM pgmq.a_increment_sequence`;
    assertEquals(archive.length, 6, 'archive should have 5 messages');
  } finally {
    await sql.end();
  }
});
