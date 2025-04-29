import { createClient } from '@supabase/supabase-js';
import { randomSleep } from '../utils.ts';
import type { Database } from '../database-types.d.ts';
type WebsiteRow = Database['public']['Tables']['websites']['Row'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);

export default async (input: {
  websiteUrl: string;
  sentiment: number;
  summary: string;
}) => {
  await randomSleep(100, 500);
  const { data } = await supabase
    .from('websites')
    .insert([
      {
        website_url: input.websiteUrl,
        sentiment: input.sentiment,
        summary: input.summary,
      },
    ])
    .select('*')
    .single()
    .throwOnError();
  console.log('results', data);

  return { success: true, website: data };
};
