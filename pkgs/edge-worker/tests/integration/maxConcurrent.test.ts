import { describe, it, expect } from 'vitest';
import { createQueueWorker } from '../../src/queue/createQueueWorker.js';
import { setupTransactionTests } from '../db.js';
import { createFakeLogger } from '../fakes.js';
import { waitFor } from '../e2e/_helpers.js';
import type { PgmqMessageRecord } from '../../src/queue/types.js';
import { setTimeout as delay } from 'node:timers/promises';
import { sendBatch } from '../helpers.js';

const QUEUE_NAME = 'max_concurrent';
const MESSAGES_TO_SEND = 3;

async function sleepFor1s() {
  await delay(1000);
}

describe('Worker concurrency', () => {
  const getSql = setupTransactionTests();

  it('maxConcurrent option is respected', async () => {
    const sql = getSql();
    const worker = createQueueWorker(
      sleepFor1s,
      {
        sql,
        maxConcurrent: 1,
        maxPollSeconds: 1,
        visibilityTimeout: 5,
        queueName: QUEUE_NAME,
      },
      createFakeLogger
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

      expect(messages.length).toBe(3, 'there should be 3 archived messages');
      expect(messages.map((m) => m.read_ct)).toEqual(
        [1, 1, 1],
        'each message should be read exacly once'
      );

      const endTime = Date.now();
      const totalMs = Math.round(endTime - startTime);

      expect(totalMs).toBeGreaterThanOrEqual(
        MESSAGES_TO_SEND * 1000, // 3 messages, each takes 1s
        `Should take at least ${MESSAGES_TO_SEND}s to process all messages, took ${totalMs}ms instead`
      );
    } finally {
      await worker.stop();
    }
  });
});
