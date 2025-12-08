-- Test: ensure_workers() uses local fallback credentials when Vault is empty
begin;
select plan(4);
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

-- TEST: HTTP request URL uses local fallback base URL
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Store result in temp table to ensure ensure_workers() executes before we query the queue
select * into temporary test3_result from pgflow.ensure_workers();

select ok(
  (select url = 'http://kong:8000/functions/v1/my-function'
   from net.http_request_queue
   where id = (select request_id from test3_result limit 1)),
  'HTTP request URL uses local fallback (http://kong:8000/functions/v1)'
);

drop table test3_result;

-- TEST: HTTP request has no Authorization header in local mode
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Store result in temp table to ensure ensure_workers() executes before we query the queue
select * into temporary test4_result from pgflow.ensure_workers();

select ok(
  (select headers->>'Authorization' is null
   from net.http_request_queue
   where id = (select request_id from test4_result limit 1)),
  'HTTP request has no Authorization header in local mode'
);

drop table test4_result;

select finish();
rollback;
