import { timingSafeEqual } from '@std/crypto/timing-safe-equal';
import { isLocalSupabaseEnv } from './localDetection.ts';

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

  // Length check first (timingSafeEqual requires same length)
  if (authBytes.length !== expectedBytes.length) {
    return { valid: false, error: 'Invalid Authorization header' };
  }

  if (!timingSafeEqual(authBytes, expectedBytes)) {
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
