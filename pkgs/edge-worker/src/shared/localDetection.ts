/**
 * Local Supabase CLI sets SUPABASE_URL to this Docker-internal API gateway.
 */
export const LOCAL_SUPABASE_HOST = 'kong:8000';

/**
 * Checks if the provided environment indicates local Supabase development.
 * Uses SUPABASE_URL to detect local environment (more reliable than key matching).
 */
export function isLocalSupabaseEnv(env: Record<string, string | undefined>): boolean {
  const supabaseUrl = env['SUPABASE_URL'];
  if (!supabaseUrl) return false;

  try {
    return new URL(supabaseUrl).host === LOCAL_SUPABASE_HOST;
  } catch {
    return false;
  }
}
