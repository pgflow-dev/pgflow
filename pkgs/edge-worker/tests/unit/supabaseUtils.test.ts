import { assertEquals } from '@std/assert';
import { 
  getAnonSupabaseClient, 
  getServiceSupabaseClient, 
  resetMemoizedClients 
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

Deno.test('getAnonSupabaseClient - returns undefined when SUPABASE_URL is missing', () => {
  const env = {
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  const client = getAnonSupabaseClient(env);
  assertEquals(client, undefined);
});

Deno.test('getAnonSupabaseClient - returns undefined when SUPABASE_ANON_KEY is missing', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
  };

  const client = getAnonSupabaseClient(env);
  assertEquals(client, undefined);
});

Deno.test('getAnonSupabaseClient - returns undefined when both env vars are missing', () => {
  const env = {};

  const client = getAnonSupabaseClient(env);
  assertEquals(client, undefined);
});

Deno.test('getAnonSupabaseClient - creates client when both env vars exist', () => {
  resetMemoizedClients(); // Start fresh
  
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  const client = getAnonSupabaseClient(env);
  assertEquals(client !== undefined, true);
});

Deno.test('getAnonSupabaseClient - returns same instance on subsequent calls (memoization)', () => {
  resetMemoizedClients(); // Start fresh
  
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  const client1 = getAnonSupabaseClient(env);
  const client2 = getAnonSupabaseClient(env);
  
  // Should be the exact same instance
  assertEquals(client1, client2);
});

Deno.test('getServiceSupabaseClient - returns undefined when SUPABASE_URL is missing', () => {
  const env = {
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const client = getServiceSupabaseClient(env);
  assertEquals(client, undefined);
});

Deno.test('getServiceSupabaseClient - returns undefined when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
  };

  const client = getServiceSupabaseClient(env);
  assertEquals(client, undefined);
});

Deno.test('getServiceSupabaseClient - creates client when both env vars exist', () => {
  resetMemoizedClients(); // Start fresh
  
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const client = getServiceSupabaseClient(env);
  assertEquals(client !== undefined, true);
});

Deno.test('getServiceSupabaseClient - returns same instance on subsequent calls (memoization)', () => {
  resetMemoizedClients(); // Start fresh
  
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const client1 = getServiceSupabaseClient(env);
  const client2 = getServiceSupabaseClient(env);
  
  // Should be the exact same instance
  assertEquals(client1, client2);
});

Deno.test('client isolation - maintains separate instances for anon and service clients', () => {
  resetMemoizedClients(); // Start fresh
  
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const anonClient = getAnonSupabaseClient(env);
  const serviceClient = getServiceSupabaseClient(env);

  // Should be different instances
  assertEquals(anonClient === serviceClient, false);
});

Deno.test('resetMemoizedClients - clears memoized clients', () => {
  const env = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };

  // Create clients
  const client1 = getAnonSupabaseClient(env);

  // Reset
  resetMemoizedClients();

  // Get new client
  const client2 = getAnonSupabaseClient(env);

  // Should be different instances after reset
  assertEquals(client1 === client2, false);
});

Deno.test('edge cases - handles undefined values in env object', () => {
  const env = {
    SUPABASE_URL: undefined,
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  };

  const anonClient = getAnonSupabaseClient(env);
  const serviceClient = getServiceSupabaseClient(env);

  assertEquals(anonClient, undefined);
  assertEquals(serviceClient, undefined);
});

Deno.test('edge cases - handles empty string values as missing', () => {
  const env = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  };

  const anonClient = getAnonSupabaseClient(env);
  const serviceClient = getServiceSupabaseClient(env);

  assertEquals(anonClient, undefined);
  assertEquals(serviceClient, undefined);
});