import postgres from 'postgres';
import { beforeEach, afterEach } from 'vitest';

function createSql(dbUrl: string) {
  return postgres(dbUrl, {
    prepare: false,

    // eslint-disable-next-line
    onnotice(_: unknown) {
      // no-op to silence notices
    },
  });
}

/**
 * Vitest-compatible transaction wrapper
 * Use this in a describe block to set up a transaction for each test
 */
export function setupTransactionTests() {
  const dbUrl = `postgresql://supabase_admin:postgres@localhost:5432/postgres`;
  let sql: postgres.Sql;

  beforeEach(async () => {
    sql = createSql(dbUrl);
    await sql`BEGIN`;
  });

  afterEach(async () => {
    await sql`ROLLBACK`;
    await sql.end();
  });

  return () => sql;
}

/**
 * Legacy transaction wrapper for compatibility
 * This should be gradually replaced with setupTransactionTests
 */
export function withTransaction(
  callback: (sql: postgres.Sql) => Promise<unknown>
) {
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
      console.error('Error in withTransaction:', err);
      throw err;
    } finally {
      console.log('Closing connection');
      await localSql.end();
    }
  };
}

/**
 * Legacy non-transaction wrapper for compatibility
 * This should be gradually replaced with a Vitest-compatible approach
 */
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
