import { assertEquals, assertThrows } from '@std/assert';
import { 
  createAnonSupabaseClient, 
  createServiceSupabaseClient
} from '../../src/core/supabase-utils.ts';

// Mock env for testing
const mockEnvWithAllKeys = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
};

const mockEnvWithPartialKeys = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  // Missing SUPABASE_SERVICE_ROLE_KEY
};

const mockEnvEmpty = {
  // No Supabase keys
};

Deno.test('createAnonSupabaseClient - throws when SUPABASE_URL is missing', () => {
  const env = {
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  assertThrows(
    () => createAnonSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment'
  );
});

Deno.test('createAnonSupabaseClient - throws when SUPABASE_ANON_KEY is missing', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
  };

  assertThrows(
    () => createAnonSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment'
  );
});

Deno.test('createAnonSupabaseClient - throws when both env vars are missing', () => {
  const env = {};

  assertThrows(
    () => createAnonSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment'
  );
});

Deno.test('createAnonSupabaseClient - creates client when both env vars exist', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  const client = createAnonSupabaseClient(env);
  assertEquals(client !== undefined, true);
});

Deno.test('createAnonSupabaseClient - creates new instance each time (no memoization)', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  const client1 = createAnonSupabaseClient(env);
  const client2 = createAnonSupabaseClient(env);
  
  // Should be different instances since no memoization
  assertEquals(client1 === client2, false);
});

Deno.test('createServiceSupabaseClient - throws when SUPABASE_URL is missing', () => {
  const env = {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  assertThrows(
    () => createServiceSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment'
  );
});

Deno.test('createServiceSupabaseClient - throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
  };

  assertThrows(
    () => createServiceSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment'
  );
});

Deno.test('createServiceSupabaseClient - creates client when both env vars exist', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const client = createServiceSupabaseClient(env);
  assertEquals(client !== undefined, true);
});

Deno.test('createServiceSupabaseClient - creates new instance each time (no memoization)', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const client1 = createServiceSupabaseClient(env);
  const client2 = createServiceSupabaseClient(env);
  
  // Should be different instances since no memoization
  assertEquals(client1 === client2, false);
});

Deno.test('client isolation - maintains separate instances for anon and service clients', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const anonClient = createAnonSupabaseClient(env);
  const serviceClient = createServiceSupabaseClient(env);

  // Should be different instances
  assertEquals(anonClient === serviceClient, false);
});

Deno.test('edge cases - handles undefined values in env object', () => {
  const env = {
    SUPABASE_URL: undefined,
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  };

  assertThrows(
    () => createAnonSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment'
  );
  
  assertThrows(
    () => createServiceSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment'
  );
});

Deno.test('edge cases - handles empty string values as missing', () => {
  const env = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  };

  assertThrows(
    () => createAnonSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment'
  );
  
  assertThrows(
    () => createServiceSupabaseClient(env),
    Error,
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment'
  );
});