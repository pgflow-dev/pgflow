import { ControlPlane } from '@pgflow/edge-worker';

// Production-like values for testing secrets/configure endpoint
// These must match the values used in tests/e2e/secrets-configure.test.ts
export const TEST_PROJECT_ID = 'test-secrets-project';
export const TEST_SUPABASE_URL = `https://${TEST_PROJECT_ID}.supabase.co`;
export const TEST_ANON_KEY = 'test-production-anon-key-for-secrets';
export const TEST_SERVICE_ROLE_KEY = 'test-production-service-role-key-for-secrets';

// Mock Deno.env.get to return production-style values
// Supabase blocks Deno.env.set(), so we override .get() instead
const originalGet = Deno.env.get.bind(Deno.env);
Deno.env.get = (key: string): string | undefined => {
  if (key === 'SUPABASE_URL') return TEST_SUPABASE_URL;
  if (key === 'SUPABASE_ANON_KEY') return TEST_ANON_KEY;
  if (key === 'SUPABASE_SERVICE_ROLE_KEY') return TEST_SERVICE_ROLE_KEY;
  return originalGet(key);
};

// Serve control plane with no flows (we only need /secrets/configure)
ControlPlane.serve([]);
