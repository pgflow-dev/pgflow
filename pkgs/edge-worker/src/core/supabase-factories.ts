import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import type { Context } from './context.js';

/**
 * Factory function to create an anonymous Supabase client from context
 * Returns undefined if required environment variables are missing
 */
export function createAnonSupabaseClient(ctx: Pick<Context, 'env'>): SupabaseClient | undefined {
  const url = ctx.env.SUPABASE_URL;
  const anonKey = ctx.env.SUPABASE_ANON_KEY;
  
  if (!url || !anonKey) {
    return undefined;
  }
  
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Factory function to create a service role Supabase client from context
 * Returns undefined if required environment variables are missing
 */
export function createServiceSupabaseClient(ctx: Pick<Context, 'env'>): SupabaseClient | undefined {
  const url = ctx.env.SUPABASE_URL;
  const serviceKey = ctx.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !serviceKey) {
    return undefined;
  }
  
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}