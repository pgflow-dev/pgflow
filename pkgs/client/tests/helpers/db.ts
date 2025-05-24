import postgres from 'postgres';

function createSql(dbUrl: string) {
  return postgres(dbUrl, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

export function withTransaction(
  callback: (sql: postgres.Sql) => Promise<unknown>
) {
  const dbUrl = `postgresql://postgres:postgres@localhost:50522/postgres`;
  const localSql = createSql(dbUrl);

  return async () => {
    try {
      let callbackError: unknown = null;

      await localSql.begin(async (sql: postgres.Sql) => {
        // Add no-op end() method to transaction-local sql
        const wrappedSql = Object.assign(sql, {
          end: async () => {
            /* no-op */
          },
        });

        try {
          await callback(wrappedSql);
        } catch (error) {
          callbackError = error;
        } finally {
          // Using ROLLBACK AND CHAIN to avoid "no transaction in progress" warning
          await sql`ROLLBACK AND CHAIN`;
        }
      });

      if (callbackError) {
        throw callbackError;
      }
    } catch (err) {
      console.error('Error in withTransaction:', err);
      throw err;
    } finally {
      await localSql.end();
    }
  };
}

export function withPgNoTransaction(
  callback: (sql: postgres.Sql) => Promise<unknown>
) {
  const dbUrl = 'postgresql://postgres:postgres@localhost:50522/postgres';
  const sql = createSql(dbUrl);

  return async () => {
    try {
      await callback(sql);
    } finally {
      await sql.end();
    }
  };
}