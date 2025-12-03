import { assertEquals, assertThrows } from '@std/assert';
import {
  KNOWN_LOCAL_ANON_KEY,
  KNOWN_LOCAL_SERVICE_ROLE_KEY,
} from '../../../src/shared/localDetection.ts';
import {
  resolveConnectionString,
  assertConnectionAvailable,
  DOCKER_TRANSACTION_POOLER_URL,
} from '../../../src/platform/resolveConnection.ts';

// ============================================================
// Local environment tests
// ============================================================

Deno.test('connection priority - local env uses Docker pooler URL by default', () => {
  const env = { SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY };
  const result = resolveConnectionString(env);
  assertEquals(result, DOCKER_TRANSACTION_POOLER_URL);
});

Deno.test('connection priority - local env with service role key uses Docker pooler URL', () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY };
  const result = resolveConnectionString(env);
  assertEquals(result, DOCKER_TRANSACTION_POOLER_URL);
});

Deno.test('connection priority - local env respects config.connectionString override', () => {
  const env = { SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY };
  const options = { connectionString: 'postgresql://custom:5432/db' };
  const result = resolveConnectionString(env, options);
  assertEquals(result, 'postgresql://custom:5432/db');
});

Deno.test('connection priority - local env respects config.sql override', () => {
  const env = { SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY };
  const options = { hasSql: true };
  const result = resolveConnectionString(env, options);
  // When sql is provided, we don't use the local pooler URL
  // The result is undefined because no connectionString was provided
  assertEquals(result, undefined);
});

Deno.test('connection priority - local env with EDGE_WORKER_DB_URL uses it instead of docker pooler', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY,
    EDGE_WORKER_DB_URL: 'postgresql://custom-local:5432/db',
  };
  const result = resolveConnectionString(env);
  assertEquals(result, 'postgresql://custom-local:5432/db');
});

// ============================================================
// Production environment tests
// ============================================================

Deno.test('connection priority - production uses EDGE_WORKER_DB_URL', () => {
  const env = {
    SUPABASE_ANON_KEY: 'prod-anon-key',
    EDGE_WORKER_DB_URL: 'postgresql://prod:5432/db',
  };
  const result = resolveConnectionString(env);
  assertEquals(result, 'postgresql://prod:5432/db');
});

Deno.test('connection priority - production config.connectionString overrides env var', () => {
  const env = {
    SUPABASE_ANON_KEY: 'prod-anon-key',
    EDGE_WORKER_DB_URL: 'postgresql://prod:5432/db',
  };
  const options = { connectionString: 'postgresql://override:5432/db' };
  const result = resolveConnectionString(env, options);
  assertEquals(result, 'postgresql://override:5432/db');
});

Deno.test('connection priority - production returns undefined when nothing configured', () => {
  const env = { SUPABASE_ANON_KEY: 'prod-anon-key' };
  const result = resolveConnectionString(env);
  assertEquals(result, undefined);
});

// ============================================================
// Error case tests
// ============================================================

Deno.test('connection validation - throws when no connection available on production', () => {
  const env = { SUPABASE_ANON_KEY: 'prod-anon-key' };
  const connectionString = resolveConnectionString(env);

  assertThrows(
    () => assertConnectionAvailable(connectionString, false),
    Error,
    'No database connection available'
  );
});

Deno.test('connection validation - does not throw when connectionString is provided', () => {
  const connectionString = 'postgresql://host:5432/db';
  // Should not throw
  assertConnectionAvailable(connectionString, false);
});

Deno.test('connection validation - does not throw when sql is provided', () => {
  // Should not throw even with undefined connectionString
  assertConnectionAvailable(undefined, true);
});

Deno.test('connection validation - error message lists all options', () => {
  const env = { SUPABASE_ANON_KEY: 'prod-anon-key' };
  const connectionString = resolveConnectionString(env);

  try {
    assertConnectionAvailable(connectionString, false);
  } catch (e) {
    const error = e as Error;
    assertEquals(error.message.includes('config.sql'), true);
    assertEquals(error.message.includes('config.connectionString'), true);
    assertEquals(error.message.includes('EDGE_WORKER_DB_URL'), true);
  }
});

// ============================================================
// Preview branch pattern tests
// ============================================================

Deno.test('connection priority - preview branch fallback pattern works', () => {
  // Simulates: connectionString: Deno.env.get('EDGE_WORKER_DB_URL') || Deno.env.get('SUPABASE_DB_URL')
  const env = {
    SUPABASE_ANON_KEY: 'prod-anon-key',
    // EDGE_WORKER_DB_URL not set (preview branch)
  };

  // User provides explicit fallback
  const supabaseDbUrl = 'postgresql://preview:5432/db';
  const options = { connectionString: supabaseDbUrl };

  const result = resolveConnectionString(env, options);
  assertEquals(result, 'postgresql://preview:5432/db');
});
