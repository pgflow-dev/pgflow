import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PROJECT_ID, SUPABASE_ANON_KEY } from '$env/static/private';

export const supabase = createClient(`https://${SUPABASE_PROJECT_ID}.supabase.co`, SUPABASE_ANON_KEY);
