import postgres from 'postgres';
import { Worker } from '../../src/Worker.ts';
import { withPg } from "../db.ts";
import { delay } from "@std/async";

const DB_URL = 'postgresql://supabase_admin:postgres@localhost:5432/postgres';

export function createSql() {
  return postgres(DB_URL, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

Deno.test('Starting worker', withPg(async (sql) => {
  const worker = new Worker(console.log, {
    sql,
    maxPollSeconds: 0.001,
  });

  worker.startOnlyOnce({
    edgeFunctionName: 'test',
    // random uuid
    workerId: '12345678-1234-1234-1234-123456789012',
  });

  await delay(100);

  try {
    const workers = await sql`select * from edge_worker.workers`;

    console.log(workers);
  } finally {
    await Promise.all([sql.end(), worker.stop()]);
  }
}));

Deno.test('test even works', withPg(async (sql) => {
  const result = await sql`select now()`; 
  console.log('is working', result);
}));
