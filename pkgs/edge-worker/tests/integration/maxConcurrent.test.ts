import { assertEquals, assertGreaterOrEqual } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { createAdapter } from '../../src/platform/createAdapter.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { waitFor } from '../e2e/_helpers.ts';
import type { PgmqMessageRecord } from '../../src/queue/types.ts';
import { delay } from '@std/async';
import { sendBatch } from '../helpers.ts';

const QUEUE_NAME = 'max_concurrent';
const MESSAGES_TO_SEND = 3;

async function sleepFor1s() {
  await delay(1000);
}

Deno.test(
  'maxConcurrent option is respected',
  withTransaction(async (sql) => {
    const worker = createQueueWorker(
      sleepFor1s,
      {
        sql,
        maxConcurrent: 1,
        maxPollSeconds: 1,
        visibilityTimeout: 5,
        queueName: QUEUE_NAME,
      },
      createFakeLogger,
      createAdapter()
    );

    try {
      worker.startOnlyOnce({
        edgeFunctionName: 'test',
        // random uuid
        workerId: crypto.randomUUID(),
      });

      await sendBatch(MESSAGES_TO_SEND, QUEUE_NAME, sql);

      // worker sleeps for 1s for each message
      // se we will expect roughly 1 message per second
      const startTime = Date.now();

      const messages = await waitFor(
        async () => {
          const archivedMessages = await sql<
            PgmqMessageRecord[]
          >`SELECT * FROM ${sql('pgmq.a_' + QUEUE_NAME)}`;

          return (
            archivedMessages.length >= MESSAGES_TO_SEND && archivedMessages
          );
        },
        {
          timeoutMs: 5000,
        }
      );

      assertEquals(messages.length, 3, 'there should be 3 archived messages');
      assertEquals(
        messages.map((m) => m.read_ct),
        [1, 1, 1],
        'each message should be read exacly once'
      );

      const endTime = Date.now();
      const totalMs = Math.round(endTime - startTime);

      assertGreaterOrEqual(
        totalMs,
        MESSAGES_TO_SEND * 1000, // 3 messages, each takes 1s
        `Should take at least ${MESSAGES_TO_SEND}s to process all messages, took ${totalMs}ms instead`
      );
    } finally {
      await worker.stop();
    }
  })
);
