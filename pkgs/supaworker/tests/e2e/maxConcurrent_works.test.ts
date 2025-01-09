import { sql } from '../sql.ts';
import { assertGreaterOrEqual } from 'jsr:@std/assert';
import { sendBatch, waitForSeqValue, startWorker } from './_helpers.ts';

const MESSAGES_TO_SEND = 10;

Deno.test('worker respect maxConcurrent settings', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM pgmq.q_pgflow`;
  await sql`DELETE FROM pgmq.a_pgflow`;
  await startWorker('serial-sleep-worker');

  try {
    // worker sleeps for 1s for each message
    // se we will expect roughly 1 message per second
    const startTime = Date.now();

    await sendBatch(MESSAGES_TO_SEND);
    const expectedSeqValue = MESSAGES_TO_SEND + 1; // intial value is 1
    await waitForSeqValue(expectedSeqValue, {
      timeoutMs: 7000,
    });

    const endTime = Date.now();
    const totalMs = Math.floor(endTime - startTime);

    assertGreaterOrEqual(
      totalMs,
      MESSAGES_TO_SEND * 1000,
      `Should take at least ${MESSAGES_TO_SEND} seconds to process all messages`
    );
  } finally {
    await sql.end();
  }
});
