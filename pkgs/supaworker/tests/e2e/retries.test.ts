import { sql } from '../sql.ts';
import { assertEquals } from '@std/assert';
import { log, startWorker, waitFor } from './_helpers.ts';
import { sendBatch } from './_helpers.ts';
import { type PgmqMessageRecord } from '../../src/types.ts';

const WORKER_NAME = 'failing_always';
const RETRY_LIMIT = 2;
const RETRY_DELAY_MS = 2000;
const MAX_POLL_MS = 1000;

Deno.test('simple processing works', async () => {
  await sql`SELECT pgmq.create(${WORKER_NAME})`;
  await sql`SELECT pgmq.drop_queue(${WORKER_NAME})`;
  await sql`SELECT pgmq.create(${WORKER_NAME})`;
  await startWorker(WORKER_NAME);

  try {
    await sendBatch(1, WORKER_NAME);

    log('waiting for worker to exhaust retries and archive message...');
    const [message, ...otherMessages] = await waitFor(
      async () => {
        const archivedMessages = await sql<
          PgmqMessageRecord[]
        >`SELECT * FROM ${sql('pgmq.a_' + WORKER_NAME)}`;

        log('archived messages', archivedMessages);

        return archivedMessages.length >= 1 && archivedMessages;
      },
      {
        timeoutMs: (RETRY_LIMIT + 1) * RETRY_DELAY_MS + 1000,
      }
    );

    assertEquals(
      otherMessages,
      [],
      'there should be only one archived message'
    );

    assertEquals(
      message.read_ct,
      RETRY_LIMIT + 1,
      `messages should be read ${
        RETRY_LIMIT + 1
      } times - initial read and ${RETRY_LIMIT} retries`
    );
  } finally {
    await sql.end();
  }
});
