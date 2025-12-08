-- Test: ensure_workers() retrieves credentials from Vault
begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Create Vault secrets
select vault.create_secret(
  'test-service-role-key-from-vault',
  'pgflow_service_role_key'
);
select vault.create_secret(
  'http://vault-configured-url.example.com/functions/v1',
  'pgflow_function_base_url'
);

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate production mode (non-local jwt_secret)
set local app.settings.jwt_secret = 'production-secret-different-from-local';

-- TEST: In production mode WITH Vault secrets, function IS invoked
with result as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from result),
  1::bigint,
  'Production mode with Vault secrets invokes functions'
);

-- TEST: request_id is returned (proves Vault credentials were used for HTTP call)
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
)
select ok(
  (select request_id is not null from result limit 1),
  'Vault credentials allow HTTP invocation in production mode'
);

-- TEST: HTTP request URL uses base URL from Vault
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Store result in temp table to ensure ensure_workers() executes before we query the queue
select * into temporary test3_result from pgflow.ensure_workers();

select ok(
  (select url = 'http://vault-configured-url.example.com/functions/v1/my-function'
   from net.http_request_queue
   where id = (select request_id from test3_result limit 1)),
  'HTTP request URL is constructed from Vault pgflow_function_base_url'
);

drop table test3_result;

-- TEST: HTTP request Authorization header uses service role key from Vault
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Store result in temp table to ensure ensure_workers() executes before we query the queue
select * into temporary test4_result from pgflow.ensure_workers();

select ok(
  (select headers->>'Authorization' = 'Bearer test-service-role-key-from-vault'
   from net.http_request_queue
   where id = (select request_id from test4_result limit 1)),
  'HTTP request Authorization header contains Vault service role key'
);

drop table test4_result;

select finish();
rollback;
