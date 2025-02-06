import { EdgeWorker } from '../_src/EdgeWorker.ts';
import { sleep, sql } from '../utils.ts';

async function incrementSeq() {
  await sleep(50);

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
