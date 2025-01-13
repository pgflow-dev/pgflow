import { Supaworker } from '../_supaworker/index.ts';
import postgres from 'postgres';
import { crypto } from 'jsr:@std/crypto';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
console.log('DB_POOL_URL', DB_POOL_URL);

const sql = postgres(DB_POOL_URL);

async function cpuIntensiveTask() {
  let data = new TextEncoder().encode('burn');
  for (let i = 0; i < 30000; i++) {
    data = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  }
  console.log(
    '[cpu_intensive] last_val = ',
    await sql`SELECT nextval('test_seq')`
  );
}

Supaworker.start(cpuIntensiveTask, { queueName: 'cpu_intensive' });
