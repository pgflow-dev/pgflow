import { assertEquals } from '@std/assert';
import {
  validateServiceRoleAuth,
  createUnauthorizedResponse,
  createServerErrorResponse,
} from '../../../src/shared/authValidation.ts';
import {
  KNOWN_LOCAL_ANON_KEY,
  KNOWN_LOCAL_SERVICE_ROLE_KEY,
} from '../../../src/shared/localDetection.ts';

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
    SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY,
  };
}

function productionEnv(serviceRoleKey?: string): Record<string, string | undefined> {
  return {
    SUPABASE_ANON_KEY: 'production-anon-key-abc',
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

const PRODUCTION_SERVICE_ROLE_KEY = 'production-service-role-key-xyz';

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

Deno.test('validateServiceRoleAuth - local mode: allows request with correct auth header', () => {
  const request = createRequest(`Bearer ${KNOWN_LOCAL_SERVICE_ROLE_KEY}`);
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
  assertEquals(result, { valid: false, error: 'Server misconfigured: missing service role key' });
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
