import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Memoization storage for client instances
let memoizedAnonClient: SupabaseClient | undefined;
let memoizedServiceClient: SupabaseClient | undefined;

/**
 * Creates or returns a memoized anonymous Supabase client.
 * Returns undefined if required environment variables are missing.
 * 
 * Required env vars: SUPABASE_URL, SUPABASE_ANON_KEY
 */
export function getAnonSupabaseClient(env: Record<string, string | undefined>): SupabaseClient | undefined {
  // Return memoized instance if it exists
  if (memoizedAnonClient) {
    return memoizedAnonClient;
  }

  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  // Return undefined if required env vars are missing
  if (!url || !anonKey) {
    return undefined;
  }

  // Create and memoize the client
  memoizedAnonClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return memoizedAnonClient;
}

/**
 * Creates or returns a memoized service role Supabase client.
 * Returns undefined if required environment variables are missing.
 * 
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
export function getServiceSupabaseClient(env: Record<string, string | undefined>): SupabaseClient | undefined {
  // Return memoized instance if it exists
  if (memoizedServiceClient) {
    return memoizedServiceClient;
  }

  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  // Return undefined if required env vars are missing
  if (!url || !serviceKey) {
    return undefined;
  }

  // Create and memoize the client
  memoizedServiceClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return memoizedServiceClient;
}

/**
 * Resets the memoized clients. Useful for testing.
 */
export function resetMemoizedClients(): void {
  memoizedAnonClient = undefined;
  memoizedServiceClient = undefined;
}