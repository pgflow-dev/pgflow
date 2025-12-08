import { EdgeWorker } from '@pgflow/edge-worker';
import { crypto } from 'jsr:@std/crypto';
import { sql } from '../utils.ts';

async function cpuIntensiveTask(payload: { debug?: boolean }) {
  let data = new TextEncoder().encode('burn');
  const timeId = `stopped_at_test_${Math.random()}`;

  if (payload.debug) {
    console.time(timeId);
  }

  for (let i = 0; i < 10000; i++) {
    data = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  }

  if (payload.debug) {
    console.timeEnd(timeId);
    console.log(
      '[stopped_at_test] last_val = ',
      await sql`SELECT nextval('stopped_at_test_seq')`
    );
  } else {
    await sql`SELECT nextval('stopped_at_test_seq')`;
  }
}

EdgeWorker.start(cpuIntensiveTask, { queueName: 'stopped_at_test' });
