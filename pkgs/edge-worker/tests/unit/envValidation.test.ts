import { assertEquals, assertThrows } from '@std/assert';
import { validateSupabaseEnv } from '../../src/platform/env-validation.ts';

Deno.test('validateSupabaseEnv - returns typed env when all required vars are present', () => {
  const rawEnv = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    EDGE_WORKER_DB_URL: 'postgresql://test',
    SB_EXECUTION_ID: 'test-execution-id',
    EDGE_WORKER_LOG_LEVEL: 'debug',
    SOME_OTHER_VAR: 'ignored'
  };

  const validatedEnv = validateSupabaseEnv(rawEnv);

  assertEquals(validatedEnv.SUPABASE_URL, 'https://test.supabase.co');
  assertEquals(validatedEnv.SUPABASE_ANON_KEY, 'test-anon-key');
  assertEquals(validatedEnv.SUPABASE_SERVICE_ROLE_KEY, 'test-service-key');
  assertEquals(validatedEnv.EDGE_WORKER_DB_URL, 'postgresql://test');
  assertEquals(validatedEnv.SB_EXECUTION_ID, 'test-execution-id');
  assertEquals(validatedEnv.EDGE_WORKER_LOG_LEVEL, 'debug');
});

Deno.test('validateSupabaseEnv - optional vars can be undefined', () => {
  const rawEnv = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    EDGE_WORKER_DB_URL: 'postgresql://test',
    SB_EXECUTION_ID: 'test-execution-id',
    // EDGE_WORKER_LOG_LEVEL is optional
  };

  const validatedEnv = validateSupabaseEnv(rawEnv);

  assertEquals(validatedEnv.EDGE_WORKER_LOG_LEVEL, undefined);
});

Deno.test('validateSupabaseEnv - throws when SUPABASE_URL is missing', () => {
  const rawEnv = {
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    EDGE_WORKER_DB_URL: 'postgresql://test',
    SB_EXECUTION_ID: 'test-execution-id',
  };

  assertThrows(
    () => validateSupabaseEnv(rawEnv),
    Error,
    'Missing required environment variables: SUPABASE_URL'
  );
});

Deno.test('validateSupabaseEnv - throws when multiple required vars are missing', () => {
  const rawEnv = {
    SUPABASE_URL: 'https://test.supabase.co',
    // Missing: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, EDGE_WORKER_DB_URL, SB_EXECUTION_ID
  };

  assertThrows(
    () => validateSupabaseEnv(rawEnv),
    Error,
    'Missing required environment variables: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, EDGE_WORKER_DB_URL, SB_EXECUTION_ID'
  );
});

Deno.test('validateSupabaseEnv - handles empty strings as missing', () => {
  const rawEnv = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    EDGE_WORKER_DB_URL: 'postgresql://test',
    SB_EXECUTION_ID: 'test-execution-id',
  };

  assertThrows(
    () => validateSupabaseEnv(rawEnv),
    Error,
    'Missing required environment variables: SUPABASE_URL'
  );
});

Deno.test('validateSupabaseEnv - handles undefined values as missing', () => {
  const rawEnv = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    EDGE_WORKER_DB_URL: 'postgresql://test',
    SB_EXECUTION_ID: 'test-execution-id',
  };

  assertThrows(
    () => validateSupabaseEnv(rawEnv),
    Error,
    'Missing required environment variables: SUPABASE_ANON_KEY'
  );
});