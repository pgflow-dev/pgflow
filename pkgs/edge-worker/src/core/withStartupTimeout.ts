import type postgres from 'postgres';

/** Bound initialization SQL without changing timeouts for task handlers. */
export async function withStartupTimeout<T>(
  sql: postgres.Sql,
  query: (sql: postgres.Sql | postgres.TransactionSql) => PromiseLike<T>,
  invocationId?: string
): Promise<T> {
  if (!invocationId) return await query(sql);
  return await sql.begin(async (transaction) => {
    await transaction`SELECT
      set_config('statement_timeout', '60s', true),
      set_config('idle_in_transaction_session_timeout', '60s', true)
    `;
    return await query(transaction);
  }) as T;
}
