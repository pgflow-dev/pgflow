import { assertEquals } from '@std/assert';
import { isLocalSupabaseEnv, LOCAL_SUPABASE_HOST } from '../../../src/shared/localDetection.ts';

// ============================================================
// LOCAL_SUPABASE_HOST constant
// ============================================================

Deno.test('LOCAL_SUPABASE_HOST - matches expected value', () => {
  assertEquals(LOCAL_SUPABASE_HOST, 'kong:8000');
});

// ============================================================
// isLocalSupabaseEnv() - returns true for local dev
// ============================================================

Deno.test('isLocalSupabaseEnv - returns true for http://kong:8000', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'http://kong:8000' }), true);
});

Deno.test('isLocalSupabaseEnv - returns true for http://kong:8000/ (trailing slash)', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'http://kong:8000/' }), true);
});

Deno.test('isLocalSupabaseEnv - returns true for https://kong:8000 (different protocol)', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'https://kong:8000' }), true);
});

// ============================================================
// isLocalSupabaseEnv() - returns false for non-local
// ============================================================

Deno.test('isLocalSupabaseEnv - returns false for different port', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'http://kong:9000' }), false);
});

Deno.test('isLocalSupabaseEnv - returns true for uppercase KONG (URL normalizes to lowercase)', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'http://KONG:8000' }), true);
});

Deno.test('isLocalSupabaseEnv - returns false for supabase.co URL', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'https://abc123.supabase.co' }), false);
});

Deno.test('isLocalSupabaseEnv - returns false for custom domain', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'https://api.myapp.com' }), false);
});

Deno.test('isLocalSupabaseEnv - returns false for localhost', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'http://localhost:54321' }), false);
});

// ============================================================
// isLocalSupabaseEnv() - edge cases
// ============================================================

Deno.test('isLocalSupabaseEnv - returns false for empty env', () => {
  assertEquals(isLocalSupabaseEnv({}), false);
});

Deno.test('isLocalSupabaseEnv - returns false for invalid URL', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: 'not-a-url' }), false);
});

Deno.test('isLocalSupabaseEnv - returns false for undefined SUPABASE_URL', () => {
  assertEquals(isLocalSupabaseEnv({ SUPABASE_URL: undefined }), false);
});
