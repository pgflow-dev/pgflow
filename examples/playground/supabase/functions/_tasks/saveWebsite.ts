import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database-types.d.ts';

let _supabase: SupabaseClient<Database> | undefined;

function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      'SUPABASE_SERVICE_ROLE_KEY',
    )!;
    _supabase = createClient<Database, 'public'>(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
  }

  return _supabase;
}

export default async (websiteData: {
  user_id: string;
  website_url: string;
  summary: string;
  tags: string[];
}) => {
  const { data } = await getSupabase()
    .schema('public')
    .from('websites')
    .insert([websiteData])
    .select('*')
    .single()
    .throwOnError();
  console.log('results', data);

  return { success: true, website: data };
};
