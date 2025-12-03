import { isLocalSupabaseEnv } from '../shared/localDetection.ts';

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
