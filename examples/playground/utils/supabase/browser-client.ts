// utils/supabase/browser-client.ts
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/supabase/functions/database-types';
import { logger } from '@/utils/utils';

let supabaseClientInstance: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Creates a singleton Supabase client for browser use.
 * This ensures only one instance is created throughout the app lifecycle.
 */
export const createClient = () => {
  if (supabaseClientInstance === null) {
    logger.log('Creating a new Supabase browser client instance');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error('Missing Supabase environment variables');
      throw new Error('Missing required environment variables for Supabase client');
    }
    
    supabaseClientInstance = createBrowserClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
    );
  } else {
    logger.log('Reusing existing Supabase browser client instance');
  }
  
  return supabaseClientInstance;
};