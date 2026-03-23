import { assertEquals, assertGreaterOrEqual } from '@std/assert';
import { createQueueWorker } from '../../src/queue/createQueueWorker.ts';
import { createTestPlatformAdapter } from './_helpers.ts';
import { withTransaction } from '../db.ts';
import { createFakeLogger } from '../fakes.ts';
import { waitFor } from '../e2e/_helpers.ts';
import type { PgmqMessageRecord } from '../../src/queue/types.ts';
import { delay } from '@std/async';
import { sendBatch, waitForQueue } from '../helpers.ts';

const QUEUE_NAME = 'max_concurrent';
const MESSAGES_TO_SEND = 3;

async function sleepFor1s() {
  await delay(1000);
}

Deno.test(
  'refills a freed slot before the slowest task in the previous batch finishes',
  withTransaction(async (sql) => {
    const taskTimes = new Map<
      string,
      { startedAt?: number; finishedAt?: number }
    >();

    const worker = createQueueWorker(
      async (rawPayload: { id: string; delayMs: number } | string) => {
        const payload = typeof rawPayload === 'string'
          ? JSON.parse(rawPayload) as { id: string; delayMs: number }
          : rawPayload;
        const timing = taskTimes.get(payload.id) ?? {};
        timing.startedAt = Date.now();
        taskTimes.set(payload.id, timing);

        await delay(payload.delayMs);

        timing.finishedAt = Date.now();
        taskTimes.set(payload.id, timing);
      },
      {
        sql,
        maxConcurrent: 2,
        batchSize: 2,
        maxPollSeconds: 1,
        visibilityTimeout: 5,
        queueName: QUEUE_NAME,
      },
      createFakeLogger,
      createTestPlatformAdapter(sql)
    );

    try {
      worker.startOnlyOnce({
        edgeFunctionName: 'test',
        workerId: crypto.randomUUID(),
      });
      await waitForQueue(sql, QUEUE_NAME);

      await sql`
        SELECT pgmq.send_batch(
          ${QUEUE_NAME},
          ARRAY[
            ${JSON.stringify({ id: 'slow', delayMs: 1000 })}::jsonb,
            ${JSON.stringify({ id: 'fast', delayMs: 50 })}::jsonb,
            ${JSON.stringify({ id: 'refill', delayMs: 50 })}::jsonb
          ]
        )
      `;

      await waitFor(
        () => {
          const slow = taskTimes.get('slow');
          const fast = taskTimes.get('fast');
          const refill = taskTimes.get('refill');

          return taskTimes.size === 3 && slow?.finishedAt && fast?.finishedAt && refill?.finishedAt
            ? { slow, fast, refill }
            : false;
        },
        {
          timeoutMs: 5000,
          pollIntervalMs: 20,
          description: 'all queue tasks to finish',
        }
      );

      const slow = taskTimes.get('slow')!;
      const fast = taskTimes.get('fast')!;
      const refill = taskTimes.get('refill')!;

      assertEquals(typeof slow.startedAt, 'number');
      assertEquals(typeof fast.startedAt, 'number');
      assertEquals(typeof refill.startedAt, 'number');

      assertEquals(
        (refill.startedAt as number) >= (fast.finishedAt as number),
        true,
        'refill task should not start before a slot is freed'
      );
      assertEquals(
        (refill.startedAt as number) < (slow.finishedAt as number),
        true,
        'refill task should start before the slow task from the previous batch finishes'
      );
    } finally {
      await worker.stop();
    }
  })
);

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
      createTestPlatformAdapter(sql)
    );

    try {
      worker.startOnlyOnce({
        edgeFunctionName: 'test',
        // random uuid
        workerId: crypto.randomUUID(),
      });
      await waitForQueue(sql, QUEUE_NAME);

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
