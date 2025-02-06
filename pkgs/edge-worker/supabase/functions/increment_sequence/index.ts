import { EdgeWorker } from '../_src/EdgeWorker.ts';
import { sql } from '../utils.ts';

// await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
// await sql`SELECT pgmq.create('increment_sequence')`;

async function incrementCounter() {
  console.log(
    '[increment_sequence] next_seq =',
    await sql`SELECT nextval('test_seq')`
  );
}

EdgeWorker.start(incrementCounter, { queueName: 'increment_sequence' });
