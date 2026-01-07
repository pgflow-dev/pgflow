import { EdgeWorker } from '@pgflow/edge-worker';
import { configurePlatform } from '@pgflow/edge-worker/testing';
import { sql } from '../utils.ts';

// Production-like service role key for auth validation (must match test's Bearer token)
export const PRODUCTION_SERVICE_ROLE_KEY = 'test-production-service-role-key-xyz789';

// Docker-internal URL for Supabase transaction pooler
const DOCKER_POOLER_URL = 'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres';

// Override environment BEFORE EdgeWorker.start() to enable auth validation
// This simulates production mode where auth is NOT bypassed
// Note: We must include EDGE_WORKER_DB_URL because with production SUPABASE_URL,
// isLocalSupabaseEnv() returns false and the docker pooler fallback won't trigger
configurePlatform({
  getEnv: () => ({
    ...Deno.env.toObject(),
    SUPABASE_URL: 'https://test-project.supabase.co', // Production URL
    SUPABASE_SERVICE_ROLE_KEY: PRODUCTION_SERVICE_ROLE_KEY, // For auth validation
    EDGE_WORKER_DB_URL: DOCKER_POOLER_URL,
  }),
});

EdgeWorker.start(
  async (_payload) => {
    // Increment sequence to prove handler was invoked
    await sql`SELECT nextval('auth_test_seq')`;
    return { success: true };
  },
  {
    queueName: 'auth_test',
    retry: { strategy: 'fixed', limit: 0, baseDelay: 1 },
  }
);
