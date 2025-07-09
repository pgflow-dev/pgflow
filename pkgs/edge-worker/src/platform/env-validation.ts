import type { SupabaseEnv } from './types.js';

/**
 * Validates that all required Supabase environment variables are present
 * @throws Error if any required environment variable is missing
 */
export function validateSupabaseEnv(env: Record<string, string | undefined>): SupabaseEnv {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY',
    'EDGE_WORKER_DB_URL',
    'SB_EXECUTION_ID'
  ] as const;

  const missing: string[] = [];
  
  for (const key of required) {
    if (!env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'See docs to learn how to prepare the environment:\n' +
      'https://www.pgflow.dev/how-to/prepare-db-string/'
    );
  }

  // Type assertion is safe here because we've validated all required fields
  return {
    SUPABASE_URL: env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
    EDGE_WORKER_DB_URL: env.EDGE_WORKER_DB_URL!,
    SB_EXECUTION_ID: env.SB_EXECUTION_ID!,
    EDGE_WORKER_LOG_LEVEL: env.EDGE_WORKER_LOG_LEVEL
  };
}