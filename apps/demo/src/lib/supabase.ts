import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '@pgflow/client';

// Local Supabase configuration (Phase 1 - production config in Phase 6)
// Use environment variables for remote dev:
// - Set VITE_SUPABASE_URL to your dev machine (e.g., http://pc:54321)
// - Defaults to localhost for local development
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
	import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const pgflow = new PgflowClient(supabase);
