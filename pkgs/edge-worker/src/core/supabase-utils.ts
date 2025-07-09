import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates an anonymous Supabase client.
 * Throws if required environment variables are missing.
 * 
 * Required env vars: SUPABASE_URL, SUPABASE_ANON_KEY
 */
export function createAnonSupabaseClient(env: Record<string, string | undefined>): SupabaseClient {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Creates a service role Supabase client.
 * Throws if required environment variables are missing.
 * 
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
export function createServiceSupabaseClient(env: Record<string, string | undefined>): SupabaseClient {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}