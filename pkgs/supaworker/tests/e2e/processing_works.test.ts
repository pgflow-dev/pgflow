import { sql } from '../sql.ts';
import { assertEquals } from 'jsr:@std/assert';
import { startWorker, waitForSeqToIncrementBy } from './_helpers.ts';
import { sendBatch } from './_helpers.ts';

Deno.test('should send message to queue and check sequence', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM pgmq.q_pgflow`;
  await sql`DELETE FROM pgmq.a_pgflow`;
  await startWorker('increment-sequence');

  try {
    await sendBatch(6);

    const lastVal = await waitForSeqToIncrementBy(6);

    assertEquals(lastVal, 6, 'sequence should have 6 values');

    const queue = await sql`SELECT * FROM pgmq.q_pgflow`;
    assertEquals(queue.length, 0, 'queue should be empty');

    const archive = await sql`SELECT * FROM pgmq.a_pgflow`;
    assertEquals(archive.length, 6, 'archive should have 5 messages');
  } finally {
    await sql.end();
  }
});
