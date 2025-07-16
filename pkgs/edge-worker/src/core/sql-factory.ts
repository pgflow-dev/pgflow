import postgres from 'postgres';
import type { Sql } from 'postgres';

interface SqlEnv {
  EDGE_WORKER_DB_URL: string;
}

/**
 * Creates a PostgreSQL client for handler operations
 * Uses a separate connection pool from the worker's internal operations
 */
export function createSql(env: SqlEnv): Sql {
  return postgres(env.EDGE_WORKER_DB_URL, {
    max: 10, // Larger pool for handler operations
    prepare: false,
  });
}