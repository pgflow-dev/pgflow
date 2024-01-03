import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PROJECT_ID, SUPABASE_ANON_KEY } from '$env/static/private';
import type { Database } from '../../../supabase/types/supabase';

export const supabase = createClient<Database>(`https://${SUPABASE_PROJECT_ID}.supabase.co`, SUPABASE_ANON_KEY);
