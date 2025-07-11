import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database-types.d.ts';

interface WebsiteData {
  user_id: string;
  website_url: string;
  summary: string;
  tags: string[];
}

export default async (
  websiteData: WebsiteData,
  supabase: SupabaseClient<Database>,
) => {
  const { data } = await supabase
    .schema('public')
    .from('websites')
    .insert([websiteData])
    .select('*')
    .single()
    .throwOnError();
  console.log('results', data);

  return { success: true, website: data };
};
