-- Test: ensure_workers() never pings process-started workers
begin;
select plan(2);
select pgflow_tests.reset_db();

-- Clear any existing HTTP requests
delete from net._http_response;

-- Setup: Create Vault secrets for production mode
select vault.create_secret('test-service-role-key', 'supabase_service_role_key');
select vault.create_secret('testproject123', 'supabase_project_id');

-- Setup: Register two worker functions — one HTTP-started, one process-started
select pgflow.track_worker_function('http-worker', 'http');
select pgflow.track_worker_function('process-worker', 'process');

-- ============================================================
-- TEST 1: Local mode pings HTTP worker, skips process worker
-- ============================================================

-- Activate local mode via known local JWT secret
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

-- Reset debounce timestamps so functions are eligible for invocation
update pgflow.worker_functions set last_invoked_at = now() - interval '10 seconds';

-- Force evaluation into a temp table so pg_net requests are queued before we inspect them
select * into temporary local_result from pgflow.ensure_workers();

-- Assert: only the HTTP worker URL was queued (process worker must NOT appear)
select results_eq(
  $$
    select url from net.http_request_queue
    where url like 'http://kong:8000/%'
    order by url
  $$,
  $$
    select 'http://kong:8000/functions/v1/http-worker'::text as url
  $$,
  'Local mode: only HTTP worker is pinged, process worker is skipped'
);

-- ============================================================
-- TEST 2: Production mode pings HTTP worker, skips process worker
-- ============================================================

-- Clear the request queue from the local test
delete from net._http_response;

-- Reset debounce timestamps
update pgflow.worker_functions set last_invoked_at = now() - interval '10 seconds';

-- Switch to production mode (jwt_secret does NOT match the local value)
set local app.settings.jwt_secret = 'production-secret-different-from-local';

-- Force evaluation into a temp table so pg_net requests are queued before we inspect them
select * into temporary prod_result from pgflow.ensure_workers();

-- Assert: only the HTTP worker URL was queued (process worker must NOT appear)
select results_eq(
  $$
    select url from net.http_request_queue
    where url like 'https://%'
    order by url
  $$,
  $$
    select 'https://testproject123.supabase.co/functions/v1/http-worker'::text as url
  $$,
  'Production mode: only HTTP worker is pinged, process worker is skipped'
);

select finish();
rollback;
