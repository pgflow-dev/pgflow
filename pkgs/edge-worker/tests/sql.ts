import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:50322/postgres';

export function createSql() {
  return postgres(DB_URL, {
    prepare: true,
    onnotice(_) {
      // no-op to silence notices
    },
  });
}

export async function withSql<T>(
  callback: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  const sql = createSql();
  try {
    await sql`TRUNCATE edge_worker.workers CASCADE`;
    return await callback(sql);
  } finally {
    await sql.end();
  }
}

const sql = createSql();

export { type postgres, sql };
