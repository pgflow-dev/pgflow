import { assertEquals } from '@std/assert';
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

Deno.test('createAnonSupabaseClient - creates client with valid env', () => {
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

Deno.test('createServiceSupabaseClient - creates client with valid env', () => {
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
  const anonClient = createAnonSupabaseClient(mockEnvWithAllKeys);
  const serviceClient = createServiceSupabaseClient(mockEnvWithAllKeys);

  // Should be different instances
  assertEquals(anonClient === serviceClient, false);
});

Deno.test('edge cases - works with different URL formats', () => {
  const envWithTrailingSlash = {
    SUPABASE_URL: 'https://test.supabase.co/',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  const client = createAnonSupabaseClient(envWithTrailingSlash);
  assertEquals(client !== undefined, true);
});