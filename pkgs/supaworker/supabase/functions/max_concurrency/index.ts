import { Supaworker } from '../_supaworker/index.ts';
import postgres from 'postgres';
import { delay } from 'jsr:@std/async';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
console.log('DB_POOL_URL', DB_POOL_URL);

const sql = postgres(DB_POOL_URL);
await sql`SELECT pgmq.create('max_concurrency')`;
await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;

async function incrementSeq() {
  const randTimeMs = Math.floor(Math.random() * 1000);
  await delay(randTimeMs);

  console.log('last_val is ', await sql`SELECT nextval('test_seq')`);
}

Supaworker.start(incrementSeq, {
  queueName: 'max_concurrency',
  batchSize: 50,
  maxConcurrent: 50,
  maxPgConnections: 20,
});
