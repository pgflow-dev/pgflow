import { Supaworker } from '../_supaworker/index.ts';
import { delay } from 'jsr:@std/async';
import postgres from 'postgres';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
const sql = postgres(DB_POOL_URL);
await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;

const sleep1s = async () => {
  const lastVal = await sql`SELECT nextval('test_seq')`;
  console.log('lastVal is ', lastVal);
  await delay(1000);
};

Supaworker.start(sleep1s, {
  batchSize: 1,
  maxConcurrent: 1,
  visibilityTimeout: 1,
});
