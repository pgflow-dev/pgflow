// Old HS256 JWT keys (Supabase CLI v1)
export const KNOWN_LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const KNOWN_LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// New opaque keys (Supabase CLI v2+)
// Source: https://github.com/supabase/cli/blob/develop/pkg/config/apikeys.go
export const KNOWN_LOCAL_PUBLISHABLE_KEY =
  'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const KNOWN_LOCAL_SECRET_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

/**
 * Checks if the provided environment indicates local Supabase.
 * Use when you have access to an env record (e.g., from PlatformAdapter).
 * Supports both old HS256 JWT keys and new opaque keys from Supabase CLI v2+.
 */
export function isLocalSupabaseEnv(env: Record<string, string | undefined>): boolean {
  const anonKey = env['SUPABASE_ANON_KEY'];
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  const isLocalAnonKey =
    anonKey === KNOWN_LOCAL_ANON_KEY || anonKey === KNOWN_LOCAL_PUBLISHABLE_KEY;
  const isLocalServiceRoleKey =
    serviceRoleKey === KNOWN_LOCAL_SERVICE_ROLE_KEY ||
    serviceRoleKey === KNOWN_LOCAL_SECRET_KEY;

  return isLocalAnonKey || isLocalServiceRoleKey;
}
