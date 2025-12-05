-- Test: ensure_workers() uses local fallback credentials when Vault is empty
begin;
select plan(2);
select pgflow_tests.reset_db();

-- Ensure no Vault secrets exist
delete from vault.secrets where name in ('pgflow_service_role_key', 'pgflow_function_base_url');

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate local mode
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

-- TEST: In local mode without Vault secrets, function IS invoked (uses fallback)
with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from result),
  1::bigint,
  'Local mode uses fallback credentials when Vault is empty'
);

-- TEST: request_id is returned (proves HTTP call was made)
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
)
select ok(
  (select request_id is not null from result limit 1),
  'Local fallback credentials allow HTTP invocation'
);

select finish();
rollback;
