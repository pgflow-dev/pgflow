import { sql } from '../sql.ts';
import { assertEquals, assertGreaterOrEqual } from 'jsr:@std/assert';
import { delay } from 'jsr:@std/async';

async function seqLastValue(): Promise<number> {
  const seqResult = await sql`SELECT last_value::integer FROM test_seq`;
  return seqResult[0].last_value;
}

async function fetchWorkers() {
  return await sql`SELECT * FROM supaworker.workers`;
}

Deno.test('should spawn next worker when CPU clock limit hits', async () => {
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM supaworker.workers`;
  await sql`SELECT supaworker.spawn('increment-sequence')`;

  const MESSAGES_TO_SEND = 10000;

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
      let w = await fetchWorkers();
      console.log('Polling... current value:', lastVal, w);
      await delay(1000);
      lastVal = await seqLastValue();
    }

    assertGreaterOrEqual(
      lastVal,
      MESSAGES_TO_SEND,
      'Sequence value should be greater than or equal to the number of messages sent'
    );

    console.log('Awaiting for workers to die');
    await delay(7000);

    const workers = await fetchWorkers();
    console.log('workers', workers);
    assertEquals(
      workers.length,
      2,
      `Should spawn additional worker because one cannot process ${MESSAGES_TO_SEND} messages`
    );
  } finally {
    await sql.end();
  }
});
