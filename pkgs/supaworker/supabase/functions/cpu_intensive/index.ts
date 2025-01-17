import { EdgeWorker } from '../_supaworker/index.ts';
import postgres from 'postgres';
import { crypto } from 'jsr:@std/crypto';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
console.log('DB_POOL_URL', DB_POOL_URL);

const sql = postgres(DB_POOL_URL, { prepare: true });

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
