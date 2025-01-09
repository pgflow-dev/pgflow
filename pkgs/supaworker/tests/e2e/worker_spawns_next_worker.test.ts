import { sql } from '../sql.ts';
import { assertGreaterOrEqual } from 'jsr:@std/assert';
import { delay } from 'jsr:@std/async';

async function seqLastValue(): Promise<number> {
  const seqResult = await sql`SELECT last_value::integer FROM test_seq`;
  return seqResult[0].last_value;
}

Deno.test('should spawn next worker when CPU clock limit hits', async () => {
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM supaworker.workers`;
  await sql`SELECT supaworker.spawn('increment-sequence')`;

  const MESSAGES_TO_SEND = 5000;

  try {
    await sql`
      SELECT pgmq.send_batch(
        'pgflow',
        ARRAY(
          SELECT '{}'::jsonb
          FROM generate_series(1, ${MESSAGES_TO_SEND})
        )
      )`;

    let lastVal = 0;
    while (lastVal < MESSAGES_TO_SEND) {
      console.log('Polling... current value:', lastVal);
      await delay(1000);
      lastVal = await seqLastValue();
    }

    assertGreaterOrEqual(
      lastVal,
      MESSAGES_TO_SEND,
      'Sequence value should be greater than or equal to the number of messages sent'
    );
  } finally {
    await sql.end();
  }
});
