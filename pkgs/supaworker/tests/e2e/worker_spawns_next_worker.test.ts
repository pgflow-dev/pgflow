import { sql } from '../sql.ts';
import { assertEquals, assertGreaterOrEqual } from 'jsr:@std/assert';
import { delay } from 'jsr:@std/async';

async function seqLastValue(): Promise<number> {
  const seqResult = await sql`SELECT last_value::integer FROM test_seq`;
  return seqResult[0].last_value;
}

async function fetchWorkers(workerName: string) {
  return await sql`SELECT * FROM supaworker.workers`;
}

async function startWorker(workerName: string, seconds: number = 5) {
  await sql`SELECT supaworker.spawn(${workerName})`;

  let workers = await fetchWorkers(workerName);
  console.log('Waiting for worker to spawn...');

  while (workers.length === 0) {
    await delay(500);
    workers = await fetchWorkers(workerName);
  }
  console.log('Worker spawned!');
}

Deno.test('should spawn next worker when CPU clock limit hits', async () => {
  await startWorker('increment-sequence');

  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  await sql`DELETE FROM pgmq.q_pgflow`;
  await sql`DELETE FROM pgmq.a_pgflow`;
  await sql`DELETE FROM supaworker.workers`;

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
      let w = await fetchWorkers('increment-sequence');
      console.log('Polling... current value:', lastVal, w);
      await delay(1000);
      lastVal = await seqLastValue();
    }

    assertGreaterOrEqual(
      lastVal,
      MESSAGES_TO_SEND,
      'Sequence value should be greater than or equal to the number of messages sent'
    );

    const workers = await fetchWorkers('increment-sequence');
    console.log('workers', workers);

    const queue = await sql`SELECT * FROM pgmq.q_pgflow`;
    assertEquals(queue.length, 0, 'queue should be empty');

    const archive = await sql`SELECT * FROM pgmq.a_pgflow`;
    assertEquals(
      archive.length,
      MESSAGES_TO_SEND,
      `archive should have all ${MESSAGES_TO_SEND} messages`
    );
  } finally {
    await sql.end();
  }
});
