import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

export function createSql() {
  return postgres(DB_URL, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

export async function withRollback<T>(
  callback: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  const sql = createSql();
  try {
    const result = (await sql.begin(
      'read write',
      async (sqlTx: postgres.Sql) => {
        const callbackResult = await callback(sqlTx);
        await sqlTx`ROLLBACK`;
        return callbackResult;
      }
    )) as T;
    return result;
  } finally {
    await sql.end();
  }
}

export async function withSql<T>(
  callback: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  const sql = createSql();
  try {
    return await callback(sql);
  } finally {
    await sql.end();
  }
}

export type { postgres };
