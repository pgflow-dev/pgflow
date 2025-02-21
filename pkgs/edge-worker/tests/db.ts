import postgres from 'postgres';

class TransactionRollback extends Error {
  constructor() {
    super('Rolling back transaction for clean test state');
    this.name = 'TransactionRollback';
  }
}

function createSql(dbUrl: string) {
  return postgres(dbUrl, {
    prepare: false,
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

export function withTx(callback: (sql: postgres.Sql) => Promise<unknown>) {
  const dbUrl = `postgresql://supabase_admin:postgres@localhost:5432/postgres`;
  const localSql = createSql(dbUrl);

  return async () => {
    try {
      console.log('calling callback');

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
          console.log('Rolling back transaction');
          // Using ROLLBACK AND CHAIN to avoid "no transaction in progress" warning
          await sql`ROLLBACK AND CHAIN`;
        }
      });

      console.log('callback called');

      if (callbackError) {
        throw callbackError;
      }
    } catch (err) {
      console.error('Error in withTx:', err);
      throw err;
    } finally {
      console.log('Closing connection');
      await localSql.end();
    }
  };
}

export function withPgNoTransaction(
  callback: (sql: postgres.Sql) => Promise<unknown>
) {
  const dbUrl = 'postgresql://supabase_admin:postgres@localhost:5432/postgres';
  const sql = createSql(dbUrl);

  return async () => {
    try {
      await callback(sql);
    } finally {
      await sql.end();
    }
  };
}
