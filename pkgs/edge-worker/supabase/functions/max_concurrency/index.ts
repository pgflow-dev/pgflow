import { EdgeWorker } from '@pgflow/edge-worker';
import { sleep, sql } from '../utils.ts';

async function incrementSeq(payload: { debug?: boolean }) {
  await sleep(50);

  if (payload.debug) {
    console.log(
      '[max_concurrency] last_val =',
      await sql`SELECT nextval('test_seq')`
    );
  } else {
    await sql`SELECT nextval('test_seq')`;
  }
}

EdgeWorker.start(incrementSeq, {
  queueName: 'max_concurrency',
  maxConcurrent: 10,
  maxPgConnections: 4,
});
