import { EdgeWorker } from '../_src/index.ts';
import postgres from 'postgres';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
console.log('DB_POOL_URL', DB_POOL_URL);

const sql = postgres(DB_POOL_URL);
await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
await sql`SELECT pgmq.create('increment_sequence')`;

async function incrementCounter() {
  console.log(
    '[increment_sequence] next_seq =',
    await sql`SELECT nextval('test_seq')`
  );
}

EdgeWorker.start(incrementCounter, { queueName: 'increment_sequence' });
