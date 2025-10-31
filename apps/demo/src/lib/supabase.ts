import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '@pgflow/client';

// Hardcoded local Supabase defaults (Phase 1 - production config in Phase 6)
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const pgflow = new PgflowClient(supabase);
