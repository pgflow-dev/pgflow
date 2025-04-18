import { describe, it, expect } from 'vitest';
import { sql } from '../sql.js';
import {
  fetchWorkers,
  sendBatch,
  seqLastValue,
  startWorker,
  waitForSeqToIncrementBy,
} from './_helpers.js';

const WORKER_NAME = 'cpu_intensive';

// TODO: document relation between CPU clock limit, amount of time to process
//       single message and amount of messages to send
const MESSAGES_TO_SEND = 30;

describe('Worker restarts', () => {
  it('should spawn next worker when CPU clock limit hits', async () => {
    await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
    await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
    try {
      await sql`SELECT pgmq.drop_queue(${WORKER_NAME})`;
    } catch {
      // ignore
    }
    await sql`SELECT pgmq.create(${WORKER_NAME})`;
    await sql`
      DELETE FROM edge_worker.workers
      WHERE worker_id IN (
        SELECT worker_id
        FROM edge_worker.inactive_workers
      )`;
    await startWorker(WORKER_NAME);

    try {
      await sendBatch(MESSAGES_TO_SEND, WORKER_NAME);
      await waitForSeqToIncrementBy(MESSAGES_TO_SEND, {
        timeoutMs: 35000,
        pollIntervalMs: 300,
      });

      const lastValue = await seqLastValue();
      expect(lastValue).toBeGreaterThanOrEqual(
        MESSAGES_TO_SEND,
        'Sequence value should be greater than or equal to the number of messages sent'
      );

      const workers = await fetchWorkers(WORKER_NAME);
      expect(workers.length).toBeGreaterThan(
        1,
        'expected worker to spawn another but there is only 1 worker'
      );
    } finally {
      await sql.end();
    }
  });
});
