import { sql } from '../sql.ts';
import {
  assertEquals,
  assertGreaterOrEqual,
  assertLess,
} from 'jsr:@std/assert';
import { delay } from 'jsr:@std/async';
import {
  sendBatch,
  seqLastValue,
  waitForActiveWorker,
  waitForSeqValue,
} from './_helpers.ts';

const MESSAGES_TO_SEND = 5;

Deno.test('worker respect maxConcurrent settings', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM pgmq.q_pgflow`;
  await sql`DELETE FROM pgmq.a_pgflow`;
  await sql`SELECT supaworker.spawn('serial-sleep-worker')`;

  try {
    // worker sleeps for 1s for each message
    // se we will expect roughly 1 message per second
    const startTime = Date.now();

    await sendBatch(MESSAGES_TO_SEND);
    const expectedSeqValue = MESSAGES_TO_SEND + 1; // intial value is 1
    await waitForSeqValue(expectedSeqValue, {
      pollIntervalMs: 1000,
      timeoutMs: 7000,
    });

    const endTime = Date.now();
    const totalMs = Math.floor(endTime - startTime);

    assertGreaterOrEqual(
      totalMs,
      5000,
      'Should take at least 5 seconds to process all messages'
    );
  } finally {
    // Clean up connection
    await sql.end();
  }
});
