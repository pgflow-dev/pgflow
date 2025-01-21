import { EdgeWorker } from '../_src/EdgeWorker.ts';
import postgres from 'postgres';

const EDGE_WORKER_DB_URL = Deno.env.get('EDGE_WORKER_DB_URL')!;
console.log('EDGE_WORKER_DB_URL', EDGE_WORKER_DB_URL);

const sql = postgres(EDGE_WORKER_DB_URL);
await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
await sql`SELECT pgmq.create('increment_sequence')`;

async function incrementCounter() {
  console.log(
    '[increment_sequence] next_seq =',
    await sql`SELECT nextval('test_seq')`
  );
}

EdgeWorker.start(incrementCounter, { queueName: 'increment_sequence' });
