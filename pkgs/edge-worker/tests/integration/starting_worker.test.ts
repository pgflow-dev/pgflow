import { describe, it, expect } from 'vitest';
import { createQueueWorker } from '../../src/queue/createQueueWorker.js';
import { setupTransactionTests } from '../db.js';
import { createFakeLogger } from '../fakes.js';
import { sleep } from '../utils.js';

describe('Worker integration tests', () => {
  const getSql = setupTransactionTests();

  it('should start a worker', async () => {
    const sql = getSql();
    const worker = createQueueWorker(
      console.log,
      {
        sql,
        maxPollSeconds: 1,
      },
      createFakeLogger
    );

    worker.startOnlyOnce({
      edgeFunctionName: 'test',
      // random uuid
      workerId: crypto.randomUUID(),
    });

    await sleep(100);

    try {
      const workers = await sql`select * from edge_worker.workers`;
      expect(workers).toBeDefined();
      expect(workers.length).toBeGreaterThan(0);
    } finally {
      await worker.stop();
    }
  });

  it('should check pgmq version', async () => {
    const sql = getSql();
    const result = await sql`
      SELECT extversion
      FROM pg_extension
      WHERE extname = 'pgmq'
    `;
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });
});
