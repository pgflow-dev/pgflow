import { EdgeWorker } from '@pgflow/edge-worker';
import { configurePlatform } from '@pgflow/edge-worker/testing';
import { sql } from '../utils.ts';

// Production-like keys (NOT the known local demo keys)
// These must match the values used in tests/e2e/authorization.test.ts
export const PRODUCTION_ANON_KEY = 'test-production-anon-key-abc123';
export const PRODUCTION_SERVICE_ROLE_KEY = 'test-production-service-role-key-xyz789';

// Docker-internal URL for Supabase transaction pooler
const DOCKER_POOLER_URL = 'postgresql://postgres.pooler-dev:postgres@pooler:6543/postgres';

// Override environment BEFORE EdgeWorker.start() to enable auth validation
// This simulates production mode where auth is NOT bypassed
// Note: We must include EDGE_WORKER_DB_URL because with production keys,
// isLocalSupabaseEnv() returns false and the docker pooler fallback won't trigger
configurePlatform({
  getEnv: () => ({
    ...Deno.env.toObject(),
    SUPABASE_ANON_KEY: PRODUCTION_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: PRODUCTION_SERVICE_ROLE_KEY,
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
