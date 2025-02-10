import postgres from 'postgres';
import { Worker } from '../../src/Worker.ts';
import { delay } from "@std/async/delay";

const DB_URL = 'postgresql://supabase_admin:postgres@localhost:5432/postgres';

export function createSql() {
  return postgres(DB_URL, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

Deno.test('Starting worker', async () => {
  const sql = createSql();
  await sql`delete from edge_worker.workers`;

  const worker = new Worker(console.log, {
    connectionString: DB_URL,
    maxPollSeconds: 1
  });

  worker.startOnlyOnce({
    edgeFunctionName: 'test',
    // random uuid
    workerId: '12345678-1234-1234-1234-123456789012'
  });

  await delay(100);

  try {
    const workers = await sql`select * from edge_worker.workers`;

    console.log(workers);
  }
  finally {
    await sql.end();
    await worker.stop();
  }
});
