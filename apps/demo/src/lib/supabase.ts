import { createClient } from '@supabase/supabase-js';
import { PgflowClient } from '@pgflow/client';

// Supabase configuration
// Production: Uses environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
// Development: Can use environment variables for remote dev (e.g., http://pc:54321)
//              or defaults to localhost
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
	import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

// In production builds on Cloudflare, environment variables must be provided
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
	if (import.meta.env.PROD) {
		console.warn(
			'Warning: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set. Production deployment requires these environment variables.'
		);
	}
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const pgflow = new PgflowClient(supabase);
