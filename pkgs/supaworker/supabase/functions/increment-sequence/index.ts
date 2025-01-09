import { Supaworker } from '../_supaworker/index.ts';
import postgres from 'postgres';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
console.log('DB_POOL_URL', DB_POOL_URL);

const sql = postgres(DB_POOL_URL);
await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;

async function incrementCounter() {
  console.log('next_seq value', await sql`SELECT nextval('test_seq')`);
}

Supaworker.start(incrementCounter);
