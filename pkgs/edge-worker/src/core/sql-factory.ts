import postgres from 'postgres';
import type { Sql } from 'postgres';

/**
 * Creates a PostgreSQL client for handler operations
 * Uses a separate connection pool from the worker's internal operations
 */
export function createSql(env: Record<string, string | undefined>): Sql {
  const connectionString = env.EDGE_WORKER_DB_URL;
  
  if (!connectionString) {
    throw new Error('EDGE_WORKER_DB_URL must be set in environment');
  }
  
  return postgres(connectionString, {
    max: 10, // Larger pool for handler operations
    prepare: false,
  });
}