import { isLocalSupabaseEnv } from './localDetection.js';

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }

  return diff === 0;
}

export interface AuthValidationResult {
  valid: boolean;
  error?: string;
}

export function validateServiceRoleAuth(
  request: Request,
  env: Record<string, string | undefined>
): AuthValidationResult {
  // Skip validation in local mode
  if (isLocalSupabaseEnv(env)) {
    return { valid: true };
  }

  const authHeader = request.headers.get('Authorization');

  // Treat empty string as unset - use PGFLOW_AUTH_SECRET if set and non-empty,
  // otherwise fall back to SUPABASE_SERVICE_ROLE_KEY
  const authSecret = env['PGFLOW_AUTH_SECRET'];
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
  const expectedKey = (authSecret && authSecret !== '') ? authSecret : serviceRoleKey;

  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  if (!expectedKey || expectedKey === '') {
    return { valid: false, error: 'Server misconfigured: missing PGFLOW_AUTH_SECRET or SUPABASE_SERVICE_ROLE_KEY' };
  }

  const expected = `Bearer ${expectedKey}`;

  // Use constant-time comparison to prevent timing attacks
  const encoder = new TextEncoder();
  const authBytes = encoder.encode(authHeader);
  const expectedBytes = encoder.encode(expected);

  if (!timingSafeEqualBytes(authBytes, expectedBytes)) {
    return { valid: false, error: 'Invalid Authorization header' };
  }

  return { valid: true };
}

export function createUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Unauthorized', message: 'Unauthorized' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

export function createServerErrorResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Internal Server Error', message: 'Internal Server Error' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
