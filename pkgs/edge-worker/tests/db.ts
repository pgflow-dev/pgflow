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

export function withPg(callback: (sql: postgres.Sql) => Promise<unknown>) {
  const dbUrl = `postgresql://supabase_admin:postgres@localhost:5432/postgres`;
  const localSql = createSql(dbUrl);

  return async () => {
    try {
      console.log('calling callback');

      await localSql.begin(async (sql: postgres.Sql) => {
        try {
          // Create a proxy that adds no-op end() method to transaction-local sql
          const wrappedSql = new Proxy(sql, {
            get(target, prop) {
              if (prop === 'end') {
                return async () => { /* no-op */ };
              }
              return target[prop as keyof typeof target];
            }
          });

          await callback(wrappedSql);
        } catch (error) {
          console.error('Error in callback:', error);
          throw error; // This will trigger rollback
        } finally {
          console.log('Rolling back transaction');

          // deno-lint-ignore no-unsafe-finally
          throw new TransactionRollback();
        }
      });
      console.log('callback called');
    } catch (err) {
      // Only log and re-throw if it's not our intentional rollback
      if (!(err instanceof TransactionRollback)) {
        console.error('Error in withPg:', err);
        throw err;
      }
    } finally {
      console.log('Closing connection');
      await localSql.end();
    }
  }
}
