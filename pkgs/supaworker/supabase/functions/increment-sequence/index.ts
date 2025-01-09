import { Supaworker } from '../_supaworker/index.ts';
import postgres from 'postgres';

const DB_POOL_URL = Deno.env.get('DB_POOL_URL')!;
console.log('DB_POOL_URL', DB_POOL_URL);
const sql = postgres(DB_POOL_URL);
const results = await sql`CREATE SEQUENCE IF NOT EXISTS test_seq`;
console.log('results', results);

async function incrementCounter(message: any) {
  console.log('message', message);
  try {
    const [{ next_val }] = await sql`
      SELECT nextval('test_seq') as next_val
    `;
    console.log(`Sequence progressed to: ${next_val}`);
    return next_val;
  } catch (error) {
    console.error('Error progressing sequence:', error);
    throw error;
  }
}

Supaworker.start(incrementCounter);
