import { assertEquals, assertGreaterOrEqual } from '@std/assert';
import { Worker } from '../../src/Worker.ts';
import { withPg } from "../db.ts";
import { log, waitFor } from "../e2e/_helpers.ts";
import { sendBatch } from "../helpers.ts";
import { PgmqMessageRecord } from "../../src/types.ts";


// NOTE:
// This test is fragile because of interplay between retry_delay and max_poll_seconds.
// Because processing time is not 0, a max_poll_seconds set to same amount as retry_delay
// would cause the additional polling call, because the delays and processing time would take more
// than accumulated max_poll_seconds intervals.
//
// Take caution when setting up those values!
const MAX_POLL_SECONDS = 1;
const RETRY_DELAY = 2;
const RETRY_LIMIT = 2;
const QUEUE_NAME = 'failing_always';

Deno.test('retries works', withPg(async (sql) => {
  // worker retries each after 1s
  // se we will expect roughly 1 message per second
  const startTime = Date.now();

  function failingAlways() {
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(2);
    log(`[elapsed: ${elapsedSec}s] Failed as expected (╯°□°)╯︵ ┻━┻`);
    throw new Error('Intentional failure');
  }

  const worker = new Worker(failingAlways, {
    sql,
    queueName: QUEUE_NAME,
    retryLimit: RETRY_LIMIT,
    retryDelay: RETRY_DELAY,
    maxPollSeconds: MAX_POLL_SECONDS,
  });

  try {
    worker.startOnlyOnce({
      edgeFunctionName: 'test',
      // random uuid
      workerId: crypto.randomUUID(),
    });
    await sendBatch(1, QUEUE_NAME, sql);

    const expectedMinimumTime = RETRY_LIMIT * RETRY_DELAY * 1000;
    
    const [message] = await waitFor(
      async () => {
        const archivedMessages = await sql<
          PgmqMessageRecord[]
        >`SELECT * FROM ${sql('pgmq.a_' + QUEUE_NAME)}`;

        return archivedMessages.length >= 1 && archivedMessages;
      },
      {
        pollIntervalMs: 50,
        timeoutMs: expectedMinimumTime + 500,
      }
    );

    const endTime = Date.now();
    const totalMs = Math.round(endTime - startTime);
    console.log('totalMs', { totalMs, expected: expectedMinimumTime });

    assertGreaterOrEqual(
      totalMs,
      expectedMinimumTime,
      `Should take at least ${expectedMinimumTime}s to process all messages, took ${totalMs}ms instead`
    );

    assertEquals(
      message.read_ct,
      RETRY_LIMIT + 1,
      `messages should be read ${
        RETRY_LIMIT + 1
      } times - initial read and ${RETRY_LIMIT} retries`
    );
  } finally {
    await worker.stop();
  }
}));
