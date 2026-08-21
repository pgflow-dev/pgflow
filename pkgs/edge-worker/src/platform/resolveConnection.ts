import { isLocalSupabaseEnv } from '../shared/localDetection.js';
import postgres from 'postgres';

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
  DATABASE_URL?: string;
  EDGE_WORKER_DB_URL?: string;
}

export interface ConnectionOptions {
  hasSql?: boolean;
  connectionString?: string;
  allowDatabaseUrl?: boolean;
}

export interface SqlConnectionOptions extends ConnectionOptions {
  sql?: postgres.Sql;
  maxPgConnections?: number;
}

/**
 * Resolves the connection string based on priority. Supabase workers ignore
 * DATABASE_URL by default; process workers opt in to DATABASE_URL priority.
 */
export function resolveConnectionString(
  env: ConnectionEnv,
  options?: ConnectionOptions
): string | undefined {
  const envConnectionString = options?.allowDatabaseUrl
    ? env.DATABASE_URL || env.EDGE_WORKER_DB_URL
    : env.EDGE_WORKER_DB_URL;

  // Zero-config local dev: use docker pooler when nothing else is configured
  if (
    isLocalSupabaseEnv(env) &&
    !options?.hasSql &&
    !options?.connectionString &&
    !envConnectionString
  ) {
    return DOCKER_TRANSACTION_POOLER_URL;
  }

  return options?.connectionString || envConnectionString;
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
        'config.sql, config.connectionString, DATABASE_URL, or EDGE_WORKER_DB_URL environment variable.'
    );
  }
}

/**
 * Resolves and creates the SQL connection using resolveConnectionString().
 *
 * @throws Error if no connection source is available
 */
export function resolveSqlConnection(
  env: ConnectionEnv,
  options?: SqlConnectionOptions
): postgres.Sql {
  if (options?.sql) {
    return options.sql;
  }

  const connectionString = resolveConnectionString(env, options);
  if (connectionString) {
    return postgres(connectionString, {
      prepare: false,
      max: options?.maxPgConnections ?? 4,
    });
  }

  throw new Error(
    'No database connection available. Provide one of: ' +
      'config.sql, config.connectionString, DATABASE_URL, or EDGE_WORKER_DB_URL environment variable.'
  );
}
