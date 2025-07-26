import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface SupabaseClientEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Creates a service role Supabase client.
 * Expects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be present in env.
 */
export function createServiceSupabaseClient(env: SupabaseClientEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}