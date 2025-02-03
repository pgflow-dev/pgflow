import { EdgeWorker } from '../_src/EdgeWorker.ts';
import postgres from 'postgres';
import { delay } from 'jsr:@std/async';

const EDGE_WORKER_DB_URL = Deno.env.get('EDGE_WORKER_DB_URL')!;
console.log('EDGE_WORKER_DB_URL', EDGE_WORKER_DB_URL);

const sql = postgres(EDGE_WORKER_DB_URL, { prepare: false });

async function incrementSeq() {
  await delay(0);
  // const randTimeMs = Math.floor(Math.random() * 10 + 5);
  // await delay(randTimeMs);
  console.log(
    '[max_concurrency] last_val =',
    await sql`SELECT nextval('test_seq')`
  );
}

EdgeWorker.start(incrementSeq, {
  queueName: 'max_concurrency',
  maxConcurrent: 10,
  maxPgConnections: 4,
});
