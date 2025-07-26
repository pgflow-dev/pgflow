import { assertEquals } from '@std/assert';
import { 
  createServiceSupabaseClient
} from '../../src/core/supabase-utils.ts';

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

Deno.test('edge cases - works with different URL formats', () => {
  const envWithTrailingSlash = {
    SUPABASE_URL: 'https://test.supabase.co/',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  };

  const client = createServiceSupabaseClient(envWithTrailingSlash);
  assertEquals(client !== undefined, true);
});