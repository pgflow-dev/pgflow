import { assertEquals } from '@std/assert';
import {
  isLocalSupabaseEnv,
  KNOWN_LOCAL_ANON_KEY,
  KNOWN_LOCAL_SERVICE_ROLE_KEY,
  KNOWN_LOCAL_PUBLISHABLE_KEY,
  KNOWN_LOCAL_SECRET_KEY,
} from '../../../src/shared/localDetection.ts';

// ============================================================
// Constants tests
// ============================================================

Deno.test('KNOWN_LOCAL_ANON_KEY - matches expected value', () => {
  assertEquals(
    KNOWN_LOCAL_ANON_KEY,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  );
});

Deno.test('KNOWN_LOCAL_SERVICE_ROLE_KEY - matches expected value', () => {
  assertEquals(
    KNOWN_LOCAL_SERVICE_ROLE_KEY,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );
});

Deno.test('KNOWN_LOCAL_PUBLISHABLE_KEY - matches expected value', () => {
  assertEquals(
    KNOWN_LOCAL_PUBLISHABLE_KEY,
    'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
  );
});

Deno.test('KNOWN_LOCAL_SECRET_KEY - matches expected value', () => {
  assertEquals(
    KNOWN_LOCAL_SECRET_KEY,
    'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'
  );
});

// ============================================================
// isLocalSupabaseEnv() tests
// ============================================================

Deno.test('isLocalSupabaseEnv - returns true when anon key matches local', () => {
  const env = { SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when service role key matches local', () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when both keys match local', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY,
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns false for non-local keys', () => {
  const env = {
    SUPABASE_ANON_KEY: 'prod-key',
    SUPABASE_SERVICE_ROLE_KEY: 'prod-service-key',
  };
  assertEquals(isLocalSupabaseEnv(env), false);
});

Deno.test('isLocalSupabaseEnv - returns false for empty env', () => {
  assertEquals(isLocalSupabaseEnv({}), false);
});

Deno.test('isLocalSupabaseEnv - returns false for undefined values', () => {
  const env = {
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  };
  assertEquals(isLocalSupabaseEnv(env), false);
});

Deno.test('isLocalSupabaseEnv - returns true when only anon key matches (service is prod)', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: 'prod-service-key',
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when only service role matches (anon is prod)', () => {
  const env = {
    SUPABASE_ANON_KEY: 'prod-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY,
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});

// ============================================================
// New opaque key tests (Supabase CLI v2+)
// ============================================================

Deno.test('isLocalSupabaseEnv - returns true when anon key matches new publishable key', () => {
  const env = { SUPABASE_ANON_KEY: KNOWN_LOCAL_PUBLISHABLE_KEY };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when service role matches new secret key', () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SECRET_KEY };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when both new opaque keys match', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SECRET_KEY,
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when mixing old JWT anon with new secret key', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SECRET_KEY,
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when mixing new publishable with old JWT service role', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY,
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});
