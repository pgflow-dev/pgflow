import { assertEquals, assertExists } from '@std/assert';
import { createAnonSupabaseClient, createServiceSupabaseClient } from '../../src/core/supabase-factories.ts';

Deno.test('createAnonSupabaseClient - returns undefined when SUPABASE_URL is missing', () => {
  const ctx = {
    env: {
      SUPABASE_ANON_KEY: 'test-anon-key',
    }
  };
  
  const client = createAnonSupabaseClient(ctx);
  assertEquals(client, undefined);
});

Deno.test('createAnonSupabaseClient - returns undefined when SUPABASE_ANON_KEY is missing', () => {
  const ctx = {
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
    }
  };
  
  const client = createAnonSupabaseClient(ctx);
  assertEquals(client, undefined);
});

Deno.test('createAnonSupabaseClient - creates client when both env vars are present', () => {
  const ctx = {
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
    }
  };
  
  const client = createAnonSupabaseClient(ctx);
  assertExists(client);
  // Client should have expected properties
  assertExists(client.auth);
  assertExists(client.from);
  assertExists(client.rpc);
});

Deno.test('createServiceSupabaseClient - returns undefined when SUPABASE_URL is missing', () => {
  const ctx = {
    env: {
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    }
  };
  
  const client = createServiceSupabaseClient(ctx);
  assertEquals(client, undefined);
});

Deno.test('createServiceSupabaseClient - returns undefined when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
  const ctx = {
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
    }
  };
  
  const client = createServiceSupabaseClient(ctx);
  assertEquals(client, undefined);
});

Deno.test('createServiceSupabaseClient - creates client when both env vars are present', () => {
  const ctx = {
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    }
  };
  
  const client = createServiceSupabaseClient(ctx);
  assertExists(client);
  // Client should have expected properties
  assertExists(client.auth);
  assertExists(client.from);
  assertExists(client.rpc);
});

Deno.test('factories create different instances for anon and service clients', () => {
  const ctx = {
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    }
  };
  
  const anonClient = createAnonSupabaseClient(ctx);
  const serviceClient = createServiceSupabaseClient(ctx);
  
  assertExists(anonClient);
  assertExists(serviceClient);
  // They should be different instances
  assertEquals(anonClient === serviceClient, false);
});