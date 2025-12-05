begin;
select plan(3);
select pgflow_tests.reset_db();

-- TEST: Returns true when jwt_secret matches known local Supabase value
-- The local Supabase CLI always uses this exact hardcoded JWT secret
select set_config('app.settings.jwt_secret', 'super-secret-jwt-token-with-at-least-32-characters-long', true);
select ok(
  pgflow.is_local(),
  'is_local() returns true when jwt_secret matches local Supabase value'
);

-- TEST: Returns false when jwt_secret is empty/missing (simulates hosted Supabase after Nov 2024)
-- Note: set_config with NULL is ignored, so we use empty string to simulate missing value
select set_config('app.settings.jwt_secret', '', true);
select ok(
  not pgflow.is_local(),
  'is_local() returns false when jwt_secret is empty/missing'
);

-- TEST: Returns false when jwt_secret is a different value (self-hosted or custom)
select set_config('app.settings.jwt_secret', 'some-other-custom-jwt-secret-value', true);
select ok(
  not pgflow.is_local(),
  'is_local() returns false when jwt_secret is a different value'
);

select finish();
rollback;
