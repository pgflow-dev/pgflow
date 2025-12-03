import { EdgeWorker } from '@pgflow/edge-worker';
import { crypto } from 'jsr:@std/crypto';
import { sql } from '../utils.ts';

async function cpuIntensiveTask(payload: { debug?: boolean }) {
  let data = new TextEncoder().encode('burn');
  const timeId = `cpu_intensive_${Math.random()}`;

  if (payload.debug) {
    console.time(timeId);
  }

  for (let i = 0; i < 10000; i++) {
    data = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  }

  if (payload.debug) {
    console.timeEnd(timeId);
    console.log(
      '[cpu_intensive] last_val = ',
      await sql`SELECT nextval('test_seq')`
    );
  } else {
    await sql`SELECT nextval('test_seq')`;
  }
}

EdgeWorker.start(cpuIntensiveTask, { queueName: 'cpu_intensive' });
