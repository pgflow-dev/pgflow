import { sql } from '../sql.ts';
import { assertEquals } from 'jsr:@std/assert';
import {
  log,
  startWorker,
  waitFor,
  waitForSeqToIncrementBy,
} from './_helpers.ts';
import { sendBatch } from './_helpers.ts';
import { delay } from 'jsr:@std/async';

const WORKER_NAME = 'increment_sequence';

Deno.test('should send message to queue and check sequence', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`SELECT pgmq.create(${WORKER_NAME})`;
  await sql`SELECT pgmq.drop_queue(${WORKER_NAME})`;
  await sql`SELECT pgmq.create(${WORKER_NAME})`;
  await startWorker(WORKER_NAME);

  try {
    await sendBatch(6, WORKER_NAME);

    await waitForSeqToIncrementBy(6);
    await delay(1200); // wait for BatchArchiver

    // TODO: find a better way, maybe some advisary lock?
    await delay(500); // wait for worker transaction to commit

    const queue = await sql`SELECT * FROM pgmq.q_increment_sequence`;
    log('queue', queue);
    assertEquals(queue.length, 0, 'queue should be empty');

    const archive = await sql`SELECT * FROM pgmq.a_increment_sequence`;
    assertEquals(archive.length, 6, 'archive should have 5 messages');
  } finally {
    await sql.end();
  }
});
