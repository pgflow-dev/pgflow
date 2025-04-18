import { describe, it, expect } from 'vitest';
import { createQueueWorker } from '../../src/queue/createQueueWorker.js';
import { setupTransactionTests } from '../db.js';
import { createFakeLogger } from '../fakes.js';
import { setTimeout as delay } from 'node:timers/promises';

describe('Queue creation', () => {
  const getSql = setupTransactionTests();

  it('creates queue when starting worker', async () => {
    const sql = getSql();
    const worker = createQueueWorker(
      console.log,
      {
        sql,
        maxPollSeconds: 1,
        queueName: 'custom_queue',
      },
      createFakeLogger
    );

    worker.startOnlyOnce({
      edgeFunctionName: 'test',
      // random uuid
      workerId: crypto.randomUUID(),
    });

    await delay(100);

    try {
      const result: { queue_name: string }[] =
        await sql`select queue_name from pgmq.list_queues();`;

      expect(result).toEqual(
        [{ queue_name: 'custom_queue' }],
        'queue "custom_queue" was created'
      );
    } finally {
      await worker.stop();
    }
  });
});
