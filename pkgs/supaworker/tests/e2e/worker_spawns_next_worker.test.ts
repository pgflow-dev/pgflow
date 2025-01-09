import { sql } from '../sql.ts';
import { assertEquals, assertGreaterOrEqual } from 'jsr:@std/assert';
import { sendBatch, startWorker, waitForSeqValue } from './_helpers.ts';

Deno.test('should spawn next worker when CPU clock limit hits', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM pgmq.q_pgflow`;
  await sql`DELETE FROM pgmq.a_pgflow`;
  await startWorker('increment-sequence');

  const MESSAGES_TO_SEND = 10000;

  try {
    await sendBatch(MESSAGES_TO_SEND);

    const lastVal = await waitForSeqValue(MESSAGES_TO_SEND);

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
  } finally {
    await sql.end();
  }
});
