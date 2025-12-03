import { isLocalSupabaseEnv } from '../shared/localDetection.ts';
import postgres from 'postgres';
import type { Sql } from 'postgres';

/**
 * Docker-internal URL for Supabase transaction pooler (Supavisor).
 * WARNING: This URL only resolves within the Docker network.
 * Not documented - discovered by inspecting supabase CLI internals.
 * Used automatically when running locally with `supabase start`.
 */
export const DOCKER_TRANSACTION_POOLER_URL =
  'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres';

export interface ConnectionEnv extends Record<string, string | undefined> {
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  EDGE_WORKER_DB_URL?: string;
}

export interface ConnectionOptions {
  hasSql?: boolean;
  connectionString?: string;
}

export interface SqlConnectionOptions {
  sql?: Sql;
  connectionString?: string;
}

/**
 * Resolves the connection string based on priority:
 * config.sql -> config.connectionString -> EDGE_WORKER_DB_URL -> local fallback
 */
export function resolveConnectionString(
  env: ConnectionEnv,
  options?: ConnectionOptions
): string | undefined {
  const isLocal = isLocalSupabaseEnv(env);

  // Zero-config local dev: use docker pooler when nothing else is configured
  if (
    isLocal &&
    !options?.hasSql &&
    !options?.connectionString &&
    !env.EDGE_WORKER_DB_URL
  ) {
    return DOCKER_TRANSACTION_POOLER_URL;
  }

  return options?.connectionString || env.EDGE_WORKER_DB_URL;
}

/**
 * Validates that a connection is available, throws if not.
 */
export function assertConnectionAvailable(
  connectionString: string | undefined,
  hasSql: boolean
): void {
  if (!hasSql && !connectionString) {
    throw new Error(
      'No database connection available. Provide one of: ' +
        'config.sql, config.connectionString, or EDGE_WORKER_DB_URL environment variable.'
    );
  }
}

/**
 * Resolves and creates the SQL connection based on priority:
 * 1. config.sql - User-provided SQL client (highest priority)
 * 2. config.connectionString - User-provided connection string
 * 3. EDGE_WORKER_DB_URL - Environment variable
 * 4. Local Supabase detection + Docker URL (lowest priority)
 *
 * @throws Error if no connection source is available
 */
export function resolveSqlConnection(
  env: ConnectionEnv,
  options?: SqlConnectionOptions
): Sql {
  // 1. config.sql - highest priority
  if (options?.sql) {
    return options.sql;
  }

  // 2. config.connectionString
  if (options?.connectionString) {
    return postgres(options.connectionString, { prepare: false, max: 10 });
  }

  // 3. EDGE_WORKER_DB_URL
  if (env.EDGE_WORKER_DB_URL) {
    return postgres(env.EDGE_WORKER_DB_URL, { prepare: false, max: 10 });
  }

  // 4. Local Supabase detection + docker URL
  if (isLocalSupabaseEnv(env)) {
    return postgres(DOCKER_TRANSACTION_POOLER_URL, { prepare: false, max: 10 });
  }

  throw new Error(
    'No database connection available. Provide one of: ' +
      'config.sql, config.connectionString, or EDGE_WORKER_DB_URL environment variable.'
  );
}
