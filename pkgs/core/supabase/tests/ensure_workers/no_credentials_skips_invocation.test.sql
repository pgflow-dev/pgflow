-- Test: ensure_workers() safely skips invocation when no credentials available (production)
begin;
select plan(2);
select pgflow_tests.reset_db();

-- Ensure no Vault secrets exist
delete from vault.secrets where name in ('pgflow_service_role_key', 'pgflow_function_base_url');

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate production mode (non-local jwt_secret, NO Vault secrets)
set local app.settings.jwt_secret = 'production-secret-different-from-local';

-- TEST: In production mode WITHOUT Vault secrets, returns empty (safe failure)
with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from result),
  0::bigint,
  'Production mode without credentials returns empty (misconfigured - safe failure)'
);

-- TEST: No HTTP requests were queued
-- Note: We check that last_invoked_at was NOT updated (since no invocation happened)
select ok(
  (select last_invoked_at < now() - interval '5 seconds'
   from pgflow.worker_functions
   where function_name = 'my-function'),
  'last_invoked_at not updated when no credentials available'
);

select finish();
rollback;
