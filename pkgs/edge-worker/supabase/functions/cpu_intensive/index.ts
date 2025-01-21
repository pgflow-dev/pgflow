import { EdgeWorker } from '../_src/EdgeWorker.ts';
import postgres from 'postgres';
import { crypto } from 'jsr:@std/crypto';

const EDGE_WORKER_DB_URL = Deno.env.get('EDGE_WORKER_DB_URL')!;
console.log('EDGE_WORKER_DB_URL', EDGE_WORKER_DB_URL);

const sql = postgres(EDGE_WORKER_DB_URL, { prepare: true });

async function cpuIntensiveTask() {
  let data = new TextEncoder().encode('burn');
  const timeId = `cpu_intensive_${Math.random()}`;
  console.time(timeId);
  for (let i = 0; i < 10000; i++) {
    data = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  }
  console.timeEnd(timeId);

  console.log(
    '[cpu_intensive] last_val = ',
    await sql`SELECT nextval('test_seq')`
  );
}

EdgeWorker.start(cpuIntensiveTask, { queueName: 'cpu_intensive' });
