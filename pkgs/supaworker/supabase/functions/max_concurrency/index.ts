import { Supaworker } from '../_supaworker/index.ts';
import postgres from 'postgres';
import { delay } from 'jsr:@std/async';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
console.log('DB_POOL_URL', DB_POOL_URL);

const sql = postgres(DB_POOL_URL, { prepare: false });

async function incrementSeq() {
  await delay(100);
  // const randTimeMs = Math.floor(Math.random() * 10);
  // await delay(randTimeMs);
  console.log(
    '[max_concurrency] last_val =',
    await sql`SELECT nextval('test_seq')`
  );
}

Supaworker.start(incrementSeq, {
  queueName: 'max_concurrency',
  maxConcurrent: 40,
  maxPgConnections: 4,
});
