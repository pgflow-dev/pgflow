import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomSleep } from '../utils.ts';
import type { Database } from '../database-types.d.ts';

let _supabase: SupabaseClient<Database> | undefined;

function getSupabase() {
  if (!_supabase) {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      'SUPABASE_SERVICE_ROLE_KEY',
    )!;
    _supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  return _supabase;
}

export default async (input: {
  websiteUrl: string;
  sentiment: number;
  summary: string;
  tags: string[];
}) => {
  await randomSleep(100, 500);
  const { data } = await getSupabase()
    .from('websites')
    .insert([
      {
        website_url: input.websiteUrl,
        sentiment: input.sentiment,
        summary: input.summary,
        tags: input.tags,
      },
    ])
    .select('*')
    .single()
    .throwOnError();
  console.log('results', data);

  return { success: true, website: data };
};
