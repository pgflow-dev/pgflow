import { EdgeWorker } from '../_src/EdgeWorker.ts';
import { delay } from 'jsr:@std/async';
import postgres from 'postgres';

const EDGE_WORKER_DB_URL = Deno.env.get('EDGE_WORKER_DB_URL')!;
const sql = postgres(EDGE_WORKER_DB_URL, { prepare: true });
await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
await sql`SELECT pgmq.create('serial_sleep')`;

const sleep1s = async () => {
  console.time('Task time');
  const lastVal = await sql`SELECT nextval('test_seq')`;
  console.log('[serial_sleep] lastVal =', lastVal);
  await delay(1000);
  console.timeEnd('Task time');
};

EdgeWorker.start(sleep1s, {
  queueName: 'serial_sleep',
  maxConcurrent: 1,
  visibilityTimeout: 5, // higher than the delay()
});
