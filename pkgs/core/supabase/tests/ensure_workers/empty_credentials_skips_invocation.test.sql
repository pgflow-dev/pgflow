-- Test: ensure_workers() skips invocation when credentials exist but are empty strings
begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Create Vault secrets with EMPTY strings
select vault.create_secret('', 'supabase_service_role_key');
select vault.create_secret('', 'supabase_project_id');

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate production mode (non-local jwt_secret)
set local app.settings.jwt_secret = 'production-secret-different-from-local';

-- TEST: In production mode with empty credentials, returns empty (safe failure)
with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from result),
  0::bigint,
  'Production mode with empty credentials returns empty (safe failure)'
);

-- TEST: No HTTP requests were queued (last_invoked_at unchanged)
select ok(
  (select last_invoked_at < now() - interval '5 seconds'
   from pgflow.worker_functions
   where function_name = 'my-function'),
  'last_invoked_at not updated when credentials are empty'
);

-- TEST: Empty project_id alone should skip (even with valid service role key)
delete from vault.secrets where name = 'supabase_service_role_key';
select vault.create_secret('valid-service-role-key', 'supabase_service_role_key');

-- Reset debounce
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from result),
  0::bigint,
  'Empty project_id alone causes skip even with valid service role key'
);

-- TEST: Empty service_role_key alone should skip (even with valid project_id)
delete from vault.secrets where name in ('supabase_service_role_key', 'supabase_project_id');
select vault.create_secret('', 'supabase_service_role_key');
select vault.create_secret('validproject123', 'supabase_project_id');

-- Reset debounce
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from result),
  0::bigint,
  'Empty service_role_key alone causes skip even with valid project_id'
);

select finish();
rollback;
