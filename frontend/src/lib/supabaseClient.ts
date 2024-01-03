import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PROJECT_ID, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '$supabase/types/supabase';

export const supabase = createClient<Database>(PUBLIC_SUPABASE_PROJECT_ID, PUBLIC_SUPABASE_ANON_KEY);
