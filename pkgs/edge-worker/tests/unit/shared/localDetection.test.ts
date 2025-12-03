import { assertEquals } from '@std/assert';
import {
  isLocalSupabase,
  isLocalSupabaseEnv,
  KNOWN_LOCAL_ANON_KEY,
  KNOWN_LOCAL_SERVICE_ROLE_KEY,
} from '../../../src/shared/localDetection.ts';

const ENV_ANON_KEY = 'SUPABASE_ANON_KEY';
const ENV_SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY';

// Helper to reset env vars after each test
function withEnv(
  anon: string | undefined,
  serviceRole: string | undefined,
  fn: () => void
) {
  const prevAnon = Deno.env.get(ENV_ANON_KEY);
  const prevServiceRole = Deno.env.get(ENV_SERVICE_ROLE_KEY);

  try {
    if (anon !== undefined) {
      Deno.env.set(ENV_ANON_KEY, anon);
    } else {
      Deno.env.delete(ENV_ANON_KEY);
    }
    if (serviceRole !== undefined) {
      Deno.env.set(ENV_SERVICE_ROLE_KEY, serviceRole);
    } else {
      Deno.env.delete(ENV_SERVICE_ROLE_KEY);
    }
    fn();
  } finally {
    if (prevAnon !== undefined) {
      Deno.env.set(ENV_ANON_KEY, prevAnon);
    } else {
      Deno.env.delete(ENV_ANON_KEY);
    }
    if (prevServiceRole !== undefined) {
      Deno.env.set(ENV_SERVICE_ROLE_KEY, prevServiceRole);
    } else {
      Deno.env.delete(ENV_SERVICE_ROLE_KEY);
    }
  }
}

// ============================================================
// Constants tests
// ============================================================

Deno.test('KNOWN_LOCAL_ANON_KEY - matches expected value', () => {
  assertEquals(
    KNOWN_LOCAL_ANON_KEY,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  );
});

Deno.test('KNOWN_LOCAL_SERVICE_ROLE_KEY - matches expected value', () => {
  assertEquals(
    KNOWN_LOCAL_SERVICE_ROLE_KEY,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );
});

// ============================================================
// isLocalSupabase() tests
// ============================================================

Deno.test('isLocalSupabase - returns true when SUPABASE_ANON_KEY matches local', () => {
  withEnv(KNOWN_LOCAL_ANON_KEY, undefined, () => {
    assertEquals(isLocalSupabase(), true);
  });
});

Deno.test('isLocalSupabase - returns true when SUPABASE_SERVICE_ROLE_KEY matches local', () => {
  withEnv(undefined, KNOWN_LOCAL_SERVICE_ROLE_KEY, () => {
    assertEquals(isLocalSupabase(), true);
  });
});

Deno.test('isLocalSupabase - returns true when both keys match local', () => {
  withEnv(KNOWN_LOCAL_ANON_KEY, KNOWN_LOCAL_SERVICE_ROLE_KEY, () => {
    assertEquals(isLocalSupabase(), true);
  });
});

Deno.test('isLocalSupabase - returns false when neither key is set', () => {
  withEnv(undefined, undefined, () => {
    assertEquals(isLocalSupabase(), false);
  });
});

Deno.test('isLocalSupabase - returns false when keys are production values', () => {
  withEnv('production-anon-key-abc', 'production-service-role-key-xyz', () => {
    assertEquals(isLocalSupabase(), false);
  });
});

Deno.test('isLocalSupabase - returns false for empty string keys', () => {
  withEnv('', '', () => {
    assertEquals(isLocalSupabase(), false);
  });
});

Deno.test('isLocalSupabase - returns false for substring match', () => {
  // Test that partial matches don't trigger false positives
  const partialAnon = KNOWN_LOCAL_ANON_KEY.slice(0, 50);
  const partialService = KNOWN_LOCAL_SERVICE_ROLE_KEY.slice(0, 50);
  withEnv(partialAnon, partialService, () => {
    assertEquals(isLocalSupabase(), false);
  });
});

Deno.test('isLocalSupabase - returns false for keys with whitespace', () => {
  withEnv(' ' + KNOWN_LOCAL_ANON_KEY, KNOWN_LOCAL_SERVICE_ROLE_KEY + ' ', () => {
    assertEquals(isLocalSupabase(), false);
  });
});

Deno.test('isLocalSupabase - returns true when only anon key matches (service role is production)', () => {
  withEnv(KNOWN_LOCAL_ANON_KEY, 'production-service-role-key', () => {
    assertEquals(isLocalSupabase(), true);
  });
});

Deno.test('isLocalSupabase - returns true when only service role matches (anon is production)', () => {
  withEnv('production-anon-key', KNOWN_LOCAL_SERVICE_ROLE_KEY, () => {
    assertEquals(isLocalSupabase(), true);
  });
});

// ============================================================
// isLocalSupabaseEnv() tests
// ============================================================

Deno.test('isLocalSupabaseEnv - returns true when anon key matches local', () => {
  const env = { SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when service role key matches local', () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when both keys match local', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY,
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns false for non-local keys', () => {
  const env = {
    SUPABASE_ANON_KEY: 'prod-key',
    SUPABASE_SERVICE_ROLE_KEY: 'prod-service-key',
  };
  assertEquals(isLocalSupabaseEnv(env), false);
});

Deno.test('isLocalSupabaseEnv - returns false for empty env', () => {
  assertEquals(isLocalSupabaseEnv({}), false);
});

Deno.test('isLocalSupabaseEnv - returns false for undefined values', () => {
  const env = {
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  };
  assertEquals(isLocalSupabaseEnv(env), false);
});

Deno.test('isLocalSupabaseEnv - returns true when only anon key matches (service is prod)', () => {
  const env = {
    SUPABASE_ANON_KEY: KNOWN_LOCAL_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: 'prod-service-key',
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});

Deno.test('isLocalSupabaseEnv - returns true when only service role matches (anon is prod)', () => {
  const env = {
    SUPABASE_ANON_KEY: 'prod-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: KNOWN_LOCAL_SERVICE_ROLE_KEY,
  };
  assertEquals(isLocalSupabaseEnv(env), true);
});
