import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface SupabaseClientEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/**
 * Creates an anonymous Supabase client.
 * Expects SUPABASE_URL and SUPABASE_ANON_KEY to be present in env.
 */
export function createAnonSupabaseClient(env: SupabaseClientEnv & { SUPABASE_ANON_KEY: string }): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Creates a service role Supabase client.
 * Expects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be present in env.
 */
export function createServiceSupabaseClient(env: SupabaseClientEnv & { SUPABASE_SERVICE_ROLE_KEY: string }): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}