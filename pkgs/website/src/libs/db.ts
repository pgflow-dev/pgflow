import { SUPABASE_URL, SUPABASE_ANON_KEY } from 'astro:env/client';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function fetchWorkers() {
  const { data, error } = await supabase
    .schema('edge_worker')
    .from('active_workers')
    .select('*')
    .order('last_heartbeat_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  return data;
}
