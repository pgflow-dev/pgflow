import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

/**
 * Factory function to create an anonymous Supabase client
 * Throws an error if required environment variables are missing (they should always be present on Supabase)
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
 * Factory function to create a service role Supabase client
 * Throws an error if required environment variables are missing (they should always be present on Supabase)
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