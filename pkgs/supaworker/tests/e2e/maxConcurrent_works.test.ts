import { sql } from '../sql.ts';
import {
  assertEquals,
  assertGreaterOrEqual,
  assertLess,
} from 'jsr:@std/assert';
import { delay } from 'jsr:@std/async';
import { seqLastValue, waitForSeqValue } from './_helpers.ts';

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

    await sql`SELECT pgmq.send_batch('pgflow', ARRAY['{}', '{}', '{}', '{}', '{}']::jsonb[])`;

    await waitForSeqValue(5);

    const endTime = Date.now();
    const totalMs = Math.floor(endTime - startTime);

    assertGreaterOrEqual(
      totalMs,
      5000,
      'Should take at least 5 seconds to process all messages'
    );
    assertLess(
      totalMs,
      7000,
      'Should take less than 7 seconds to process all messages'
    );
  } finally {
    // Clean up connection
    await sql.end();
  }
});
