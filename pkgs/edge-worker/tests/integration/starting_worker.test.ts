import postgres from 'postgres';
import { Worker } from '../../src/Worker.ts';

const DB_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

export function createSql() {
  return postgres(DB_URL, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

Deno.test('Starting worker', async () => {
  let sql = createSql();

  try {
    const dbTime = await sql`select * from edge_worker.workers`;

    console.log(dbTime);
  }
  finally {
    await sql.end();
  }
});
