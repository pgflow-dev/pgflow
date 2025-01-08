import postgres from 'postgres';
import { assertEquals } from 'jsr:@std/assert';
import { delay } from 'jsr:@std/async';

Deno.test('should send message to queue and check sequence', async () => {
  // Connect to postgres
  const sql = postgres(Deno.env.get('DB_URL')!);
  const result = await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;

  try {
    await sql`SELECT pgmq.send_batch('pgflow', ARRAY['{}', '{}', '{}', '{}', '{}']::jsonb[])`;

    await delay(100);

    const seqResult = await sql`SELECT last_value FROM test_seq`;
    const nextVal = seqResult[0].last_value;

    assertEquals(nextVal, '5');
  } finally {
    // Clean up connection
    await sql.end();
  }
});
