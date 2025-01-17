import { sql } from '../sql.ts';
import { assertGreater, assertGreaterOrEqual } from 'jsr:@std/assert';
import {
  fetchWorkers,
  sendBatch,
  seqLastValue,
  startWorker,
  waitForBatchArchiver,
  waitForSeqToIncrementBy,
} from './_helpers.ts';

const WORKER_NAME = 'cpu_intensive';

// TODO: document relation between CPU clock limit, amount of time to process
//       single message and amount of messages to send
const MESSAGES_TO_SEND = 30;

Deno.test('should spawn next worker when CPU clock limit hits', async () => {
  await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
  await sql`ALTER SEQUENCE test_seq RESTART WITH 1`;
  try {
    await sql`SELECT pgmq.drop_queue(${WORKER_NAME})`;
  } catch {}
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
    await waitForBatchArchiver();

    assertGreaterOrEqual(
      await seqLastValue(),
      MESSAGES_TO_SEND,
      'Sequence value should be greater than or equal to the number of messages sent'
    );

    const workers = await fetchWorkers(WORKER_NAME);
    assertGreater(
      workers.length,
      1,
      'expected worker to spawn another but there is only 1 worker'
    );
  } finally {
    await sql.end();
  }
});
