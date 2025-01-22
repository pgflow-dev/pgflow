import { Queue } from '../../src/Queue.ts';
import { sql } from '../sql.ts';
import { startWorker } from './_helpers.ts';
import { sendBatch } from './_helpers.ts';

const WORKER_NAME = 'creating_queue';
const queue = new Queue(sql, WORKER_NAME);

Deno.test('creates queue when starting worker', async () => {
  // ensure the queue is not present so we can verify that worker will create it
  await queue.safeDrop();

  await startWorker(WORKER_NAME);

  try {
    // just sending a message should be enough to verify if the queue was created
    await sendBatch(1, WORKER_NAME);
  } finally {
    // await safeDropQueue();
    await sql.end();
  }
});
