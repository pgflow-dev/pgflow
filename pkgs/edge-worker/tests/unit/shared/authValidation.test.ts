import { assertEquals } from '@std/assert';
import {
  validateServiceRoleAuth,
  createUnauthorizedResponse,
  createServerErrorResponse,
} from '../../../src/shared/authValidation.ts';

// ============================================================
// Helper functions
// ============================================================

function createRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) {
    headers.set('Authorization', authHeader);
  }
  return new Request('http://localhost/test', { headers });
}

function localEnv(): Record<string, string | undefined> {
  return {
    SUPABASE_URL: 'http://kong:8000', // Local dev URL
    SUPABASE_SERVICE_ROLE_KEY: 'any-key', // Not used for local detection anymore
  };
}

function productionEnv(serviceRoleKey?: string): Record<string, string | undefined> {
  return {
    SUPABASE_URL: 'https://abc123.supabase.co', // Production URL
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

function productionEnvWithAuthSecret(
  authSecret?: string,
  serviceRoleKey?: string
): Record<string, string | undefined> {
  return {
    SUPABASE_ANON_KEY: 'production-anon-key-abc',
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    PGFLOW_AUTH_SECRET: authSecret,
  };
}

const PRODUCTION_SERVICE_ROLE_KEY = 'production-service-role-key-xyz';
const PGFLOW_AUTH_SECRET_VALUE = 'user-controlled-auth-secret-123';

// ============================================================
// validateServiceRoleAuth() - Local mode tests
// ============================================================

Deno.test('validateServiceRoleAuth - local mode: allows request without auth header', () => {
  const request = createRequest();
  const result = validateServiceRoleAuth(request, localEnv());
  assertEquals(result, { valid: true });
});

Deno.test('validateServiceRoleAuth - local mode: allows request with wrong auth header', () => {
  const request = createRequest('Bearer wrong-key');
  const result = validateServiceRoleAuth(request, localEnv());
  assertEquals(result, { valid: true });
});

Deno.test('validateServiceRoleAuth - local mode: allows request with any auth header', () => {
  const request = createRequest('Bearer any-key');
  const result = validateServiceRoleAuth(request, localEnv());
  assertEquals(result, { valid: true });
});

// ============================================================
// validateServiceRoleAuth() - Production mode tests
// ============================================================

Deno.test('validateServiceRoleAuth - production: rejects request without auth header', () => {
  const request = createRequest();
  const result = validateServiceRoleAuth(request, productionEnv(PRODUCTION_SERVICE_ROLE_KEY));
  assertEquals(result, { valid: false, error: 'Missing Authorization header' });
});

Deno.test('validateServiceRoleAuth - production: rejects request with wrong auth header', () => {
  const request = createRequest('Bearer wrong-key');
  const result = validateServiceRoleAuth(request, productionEnv(PRODUCTION_SERVICE_ROLE_KEY));
  assertEquals(result, { valid: false, error: 'Invalid Authorization header' });
});

Deno.test('validateServiceRoleAuth - production: accepts request with correct auth header', () => {
  const request = createRequest(`Bearer ${PRODUCTION_SERVICE_ROLE_KEY}`);
  const result = validateServiceRoleAuth(request, productionEnv(PRODUCTION_SERVICE_ROLE_KEY));
  assertEquals(result, { valid: true });
});

Deno.test('validateServiceRoleAuth - production: rejects when service role key not configured', () => {
  const request = createRequest('Bearer any-key');
  const result = validateServiceRoleAuth(request, productionEnv(undefined));
  assertEquals(result, { valid: false, error: 'Server misconfigured: missing PGFLOW_AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY' });
});

Deno.test('validateServiceRoleAuth - production: rejects Basic auth scheme', () => {
  const request = createRequest(`Basic ${PRODUCTION_SERVICE_ROLE_KEY}`);
  const result = validateServiceRoleAuth(request, productionEnv(PRODUCTION_SERVICE_ROLE_KEY));
  assertEquals(result, { valid: false, error: 'Invalid Authorization header' });
});

Deno.test('validateServiceRoleAuth - production: rejects malformed Bearer token', () => {
  const request = createRequest('Bearer');
  const result = validateServiceRoleAuth(request, productionEnv(PRODUCTION_SERVICE_ROLE_KEY));
  assertEquals(result, { valid: false, error: 'Invalid Authorization header' });
});

Deno.test('validateServiceRoleAuth - production: rejects auth header without scheme', () => {
  const request = createRequest(PRODUCTION_SERVICE_ROLE_KEY);
  const result = validateServiceRoleAuth(request, productionEnv(PRODUCTION_SERVICE_ROLE_KEY));
  assertEquals(result, { valid: false, error: 'Invalid Authorization header' });
});

// ============================================================
// validateServiceRoleAuth() - PGFLOW_AUTH_SECRET tests
// ============================================================

Deno.test('validateServiceRoleAuth - PGFLOW_AUTH_SECRET: accepts request with auth secret when set', () => {
  const request = createRequest(`Bearer ${PGFLOW_AUTH_SECRET_VALUE}`);
  const result = validateServiceRoleAuth(
    request,
    productionEnvWithAuthSecret(PGFLOW_AUTH_SECRET_VALUE, PRODUCTION_SERVICE_ROLE_KEY)
  );
  assertEquals(result, { valid: true });
});

Deno.test('validateServiceRoleAuth - PGFLOW_AUTH_SECRET: rejects service role key when auth secret is set', () => {
  const request = createRequest(`Bearer ${PRODUCTION_SERVICE_ROLE_KEY}`);
  const result = validateServiceRoleAuth(
    request,
    productionEnvWithAuthSecret(PGFLOW_AUTH_SECRET_VALUE, PRODUCTION_SERVICE_ROLE_KEY)
  );
  assertEquals(result, { valid: false, error: 'Invalid Authorization header' });
});

Deno.test('validateServiceRoleAuth - PGFLOW_AUTH_SECRET: falls back to service role key when auth secret not set', () => {
  const request = createRequest(`Bearer ${PRODUCTION_SERVICE_ROLE_KEY}`);
  const result = validateServiceRoleAuth(
    request,
    productionEnvWithAuthSecret(undefined, PRODUCTION_SERVICE_ROLE_KEY)
  );
  assertEquals(result, { valid: true });
});

Deno.test('validateServiceRoleAuth - PGFLOW_AUTH_SECRET: works without service role key when auth secret is set', () => {
  const request = createRequest(`Bearer ${PGFLOW_AUTH_SECRET_VALUE}`);
  const result = validateServiceRoleAuth(
    request,
    productionEnvWithAuthSecret(PGFLOW_AUTH_SECRET_VALUE, undefined)
  );
  assertEquals(result, { valid: true });
});

Deno.test('validateServiceRoleAuth - PGFLOW_AUTH_SECRET: returns error when neither key is set', () => {
  const request = createRequest('Bearer any-key');
  const result = validateServiceRoleAuth(
    request,
    productionEnvWithAuthSecret(undefined, undefined)
  );
  assertEquals(result, { valid: false, error: 'Server misconfigured: missing PGFLOW_AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY' });
});

Deno.test('validateServiceRoleAuth - PGFLOW_AUTH_SECRET: treats empty string as unset, falls back to service role key', () => {
  const request = createRequest(`Bearer ${PRODUCTION_SERVICE_ROLE_KEY}`);
  const result = validateServiceRoleAuth(
    request,
    productionEnvWithAuthSecret('', PRODUCTION_SERVICE_ROLE_KEY) // Empty string
  );
  assertEquals(result, { valid: true });
});

// ============================================================
// createUnauthorizedResponse() tests
// ============================================================

Deno.test('createUnauthorizedResponse - returns 401 status', () => {
  const response = createUnauthorizedResponse();
  assertEquals(response.status, 401);
});

Deno.test('createUnauthorizedResponse - returns JSON content type', () => {
  const response = createUnauthorizedResponse();
  assertEquals(response.headers.get('Content-Type'), 'application/json');
});

Deno.test('createUnauthorizedResponse - returns error body', async () => {
  const response = createUnauthorizedResponse();
  const body = await response.json();
  assertEquals(body, { error: 'Unauthorized', message: 'Unauthorized' });
});

// ============================================================
// createServerErrorResponse() tests
// ============================================================

Deno.test('createServerErrorResponse - returns 500 status', () => {
  const response = createServerErrorResponse();
  assertEquals(response.status, 500);
});

Deno.test('createServerErrorResponse - returns JSON content type', () => {
  const response = createServerErrorResponse();
  assertEquals(response.headers.get('Content-Type'), 'application/json');
});

Deno.test('createServerErrorResponse - returns error body', async () => {
  const response = createServerErrorResponse();
  const body = await response.json();
  assertEquals(body, { error: 'Internal Server Error', message: 'Internal Server Error' });
});
