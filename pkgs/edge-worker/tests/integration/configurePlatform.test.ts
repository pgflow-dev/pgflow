import { assertEquals } from '@std/assert';
import { configurePlatform } from '../../src/testing.ts';
import { SupabasePlatformAdapter } from '../../src/platform/SupabasePlatformAdapter.ts';

/**
 * Tests that configurePlatform affects adapter behavior.
 * These tests verify that global platform configuration works as expected.
 */

Deno.test({
  name: 'configurePlatform overrides env used by adapter',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    const customEnv = {
      SUPABASE_URL: 'http://custom.supabase.co',
      SUPABASE_ANON_KEY: 'custom-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'custom-service',
      SB_EXECUTION_ID: 'custom-exec',
      EDGE_WORKER_DB_URL: 'postgresql://localhost/test',
    };

    configurePlatform({
      getEnv: () => customEnv,
      onShutdown: () => {},
      extendLifetime: () => {},
      serve: () => {},
    });

    // Adapter created after configurePlatform uses configured deps
    const adapter = new SupabasePlatformAdapter();
    assertEquals(adapter.env.SUPABASE_URL, 'http://custom.supabase.co');
  },
});

Deno.test({
  name: 'multiple configurePlatform calls override previous',
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => {
    configurePlatform({
      getEnv: () => ({
        SUPABASE_URL: 'http://first.supabase.co',
        SUPABASE_ANON_KEY: 'first-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'first-service',
        SB_EXECUTION_ID: 'first-exec',
        EDGE_WORKER_DB_URL: 'postgresql://localhost/first',
      }),
      onShutdown: () => {},
      extendLifetime: () => {},
      serve: () => {},
    });

    configurePlatform({
      getEnv: () => ({
        SUPABASE_URL: 'http://second.supabase.co',
        SUPABASE_ANON_KEY: 'second-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'second-service',
        SB_EXECUTION_ID: 'second-exec',
        EDGE_WORKER_DB_URL: 'postgresql://localhost/second',
      }),
      onShutdown: () => {},
      extendLifetime: () => {},
      serve: () => {},
    });

    const adapter = new SupabasePlatformAdapter();
    assertEquals(adapter.env.SUPABASE_URL, 'http://second.supabase.co');
  },
});
