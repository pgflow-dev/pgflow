import { assertEquals, assertMatch } from '@std/assert';
import {
  createInstallerHandler,
  type InstallerDeps,
} from '../../../src/installer/server.ts';

// Helper to create mock dependencies
function createMockDeps(overrides?: Partial<InstallerDeps>): InstallerDeps {
  return {
    getEnv: (key: string) =>
      ({
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_DB_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
      })[key],
    ...overrides,
  };
}

// Helper to create a request with optional token
function createRequest(token?: string): Request {
  const url = token
    ? `http://localhost/pgflow-installer?token=${token}`
    : 'http://localhost/pgflow-installer';
  return new Request(url);
}

// ============================================================
// Token validation tests
// ============================================================

Deno.test('Installer Handler - returns 401 when token missing', async () => {
  const deps = createMockDeps();
  const handler = createInstallerHandler('expected-token', deps);

  const request = createRequest(); // no token
  const response = await handler(request);

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.success, false);
  assertMatch(data.message, /Invalid or missing token/);
});

Deno.test('Installer Handler - returns 401 when token incorrect', async () => {
  const deps = createMockDeps();
  const handler = createInstallerHandler('expected-token', deps);

  const request = createRequest('wrong-token');
  const response = await handler(request);

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.success, false);
  assertMatch(data.message, /Invalid or missing token/);
});

// ============================================================
// Environment variable validation tests
// ============================================================

Deno.test('Installer Handler - returns 500 when SUPABASE_URL missing', async () => {
  const deps = createMockDeps({
    getEnv: (key: string) =>
      ({
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
        // SUPABASE_URL is undefined
      })[key],
  });
  const handler = createInstallerHandler('valid-token', deps);

  const request = createRequest('valid-token');
  const response = await handler(request);

  assertEquals(response.status, 500);
  const data = await response.json();
  assertEquals(data.success, false);
  assertMatch(data.message, /Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/);
});

Deno.test('Installer Handler - returns 500 when SUPABASE_SERVICE_ROLE_KEY missing', async () => {
  const deps = createMockDeps({
    getEnv: (key: string) =>
      ({
        SUPABASE_URL: 'https://test.supabase.co',
        // SUPABASE_SERVICE_ROLE_KEY is undefined
      })[key],
  });
  const handler = createInstallerHandler('valid-token', deps);

  const request = createRequest('valid-token');
  const response = await handler(request);

  assertEquals(response.status, 500);
  const data = await response.json();
  assertEquals(data.success, false);
  assertMatch(data.message, /Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/);
});

Deno.test('Installer Handler - returns 500 when SUPABASE_DB_URL missing', async () => {
  const deps = createMockDeps({
    getEnv: (key: string) =>
      ({
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
        // SUPABASE_DB_URL is undefined
      })[key],
  });
  const handler = createInstallerHandler('valid-token', deps);

  const request = createRequest('valid-token');
  const response = await handler(request);

  assertEquals(response.status, 500);
  const data = await response.json();
  assertEquals(data.success, false);
  assertMatch(data.message, /Missing SUPABASE_DB_URL/);
});
