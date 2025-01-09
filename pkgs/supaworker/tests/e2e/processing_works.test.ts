import { sql } from '../sql.ts';
import { assertEquals } from 'jsr:@std/assert';
import { delay } from 'jsr:@std/async';

Deno.test('should send message to queue and check sequence', async () => {
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM pgmq.q_pgflow`;
  await sql`DELETE FROM pgmq.a_pgflow`;
  await sql`SELECT supaworker.spawn('increment-sequence')`;

  try {
    await sql`SELECT pgmq.send_batch('pgflow', ARRAY['{}', '{}', '{}', '{}', '{}']::jsonb[])`;

    await delay(200);

    const seqResult = await sql`SELECT last_value::integer FROM test_seq`;
    const nextVal = seqResult[0].last_value;

    assertEquals(nextVal, 5);

    const queue = await sql`SELECT * FROM pgmq.q_pgflow`;
    assertEquals(queue.length, 0, 'queue should be empty');

    const archive = await sql`SELECT * FROM pgmq.a_pgflow`;
    assertEquals(archive.length, 5, 'archive should have 5 messages');
  } finally {
    // Clean up connection
    await sql.end();
  }
});
