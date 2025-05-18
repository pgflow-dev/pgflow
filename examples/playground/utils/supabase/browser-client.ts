// utils/supabase/browser-client.ts
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/supabase/functions/database-types';
import { logger } from '@/utils/utils';

let supabaseClientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Creates a singleton Supabase client for browser use.
 * This ensures only one instance is created throughout the app lifecycle.
 */
export const createClient = () => {
  if (supabaseClientInstance === null) {
    logger.log('Creating a new Supabase browser client instance');
    supabaseClientInstance = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  } else {
    logger.log('Reusing existing Supabase browser client instance');
  }
  
  return supabaseClientInstance;
};