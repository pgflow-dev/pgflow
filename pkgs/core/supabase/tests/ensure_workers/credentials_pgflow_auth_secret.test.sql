-- Test: ensure_workers() uses pgflow_auth_secret with fallback to supabase_service_role_key
begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create project ID secret (needed for all tests)
select vault.create_secret('testproject123', 'supabase_project_id');

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');

-- Simulate production mode
set local app.settings.jwt_secret = 'production-secret-different-from-local';

-- =============================================================================
-- TEST 1: pgflow_auth_secret takes priority when both are set
-- =============================================================================
select vault.create_secret('pgflow-auth-secret-value', 'pgflow_auth_secret');
select vault.create_secret('legacy-service-role-key', 'supabase_service_role_key');

update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

select * into temporary test1_result from pgflow.ensure_workers();

select ok(
  (select headers->>'Authorization' = 'Bearer pgflow-auth-secret-value'
   from net.http_request_queue
   where id = (select request_id from test1_result limit 1)),
  'pgflow_auth_secret takes priority over supabase_service_role_key'
);

drop table test1_result;

-- Cleanup secrets for next test
delete from vault.secrets where name in ('pgflow_auth_secret', 'supabase_service_role_key');

-- =============================================================================
-- TEST 2: Falls back to supabase_service_role_key when pgflow_auth_secret not set
-- =============================================================================
select vault.create_secret('fallback-service-role-key', 'supabase_service_role_key');

update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

select * into temporary test2_result from pgflow.ensure_workers();

select ok(
  (select headers->>'Authorization' = 'Bearer fallback-service-role-key'
   from net.http_request_queue
   where id = (select request_id from test2_result limit 1)),
  'Falls back to supabase_service_role_key when pgflow_auth_secret not set'
);

drop table test2_result;

-- Cleanup secrets for next test
delete from vault.secrets where name = 'supabase_service_role_key';

-- =============================================================================
-- TEST 3: pgflow_auth_secret works without supabase_service_role_key
-- =============================================================================
select vault.create_secret('standalone-auth-secret', 'pgflow_auth_secret');

update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

select * into temporary test3_result from pgflow.ensure_workers();

select ok(
  (select headers->>'Authorization' = 'Bearer standalone-auth-secret'
   from net.http_request_queue
   where id = (select request_id from test3_result limit 1)),
  'pgflow_auth_secret works without supabase_service_role_key being set'
);

drop table test3_result;

select finish();
rollback;
