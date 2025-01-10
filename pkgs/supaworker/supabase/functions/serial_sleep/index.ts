import { Supaworker } from '../_supaworker/index.ts';
import { delay } from 'jsr:@std/async';
import postgres from 'postgres';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
const sql = postgres(DB_POOL_URL);
await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
await sql`SELECT pgmq.create('serial_sleep')`;

const sleep1s = async () => {
  console.time('Task time');
  const lastVal = await sql`SELECT nextval('test_seq')`;
  console.log('lastVal is ', lastVal);
  await delay(1000);
  console.timeEnd('Task time');
};

Supaworker.start(sleep1s, {
  queueName: 'serial_sleep',
  batchSize: 1,
  maxConcurrent: 1,
  visibilityTimeout: 1,
});
