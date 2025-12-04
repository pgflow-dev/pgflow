-- Test: ensure_workers() returns which functions should be invoked
begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Create Vault secrets for production mode tests
select vault.create_secret('test-service-role-key', 'pgflow_service_role_key');
select vault.create_secret('http://test.example.com/functions/v1', 'pgflow_function_base_url');

-- Setup: Register two worker functions
select pgflow.track_worker_function('function-a');
select pgflow.track_worker_function('function-b');

-- Set last_invoked_at to past (beyond debounce window) for both
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- TEST: In local mode, all enabled functions are returned for invocation
-- (We mock is_local() by setting jwt_secret)
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

select is(
  (select count(*) from pgflow.ensure_workers()),
  2::bigint,
  'In local mode, returns all enabled worker functions'
);

-- Reset last_invoked_at (was updated by previous ensure_workers call)
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate production mode by setting jwt_secret to a different value
set local app.settings.jwt_secret = 'production-secret-different-from-local';

-- TEST: In production mode with no workers, functions are returned for invocation
select is(
  (select count(*) from pgflow.ensure_workers()),
  2::bigint,
  'In production mode with no workers, returns all functions'
);

-- Reset last_invoked_at again
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Setup: Create an alive worker for function-a
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'test_queue', 'function-a', now(), now());

-- TEST: In production mode, function with alive worker is NOT returned
select is(
  (select count(*) from pgflow.ensure_workers() where ensure_workers.function_name = 'function-a'),
  0::bigint,
  'In production mode, function with alive worker is NOT returned'
);

-- Reset last_invoked_at for function-b only (function-a shouldn't be returned anyway)
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds'
where function_name = 'function-b';

-- TEST: In production mode, function without alive worker IS returned
select is(
  (select count(*) from pgflow.ensure_workers() where ensure_workers.function_name = 'function-b'),
  1::bigint,
  'In production mode, function without alive worker IS returned'
);

select finish();
rollback;
