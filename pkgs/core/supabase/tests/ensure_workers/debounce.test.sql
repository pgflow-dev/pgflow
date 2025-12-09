-- Test: ensure_workers() respects debounce window in production mode
-- Note: Debounce only applies in production mode; local mode bypasses debounce
begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Create Vault secrets for production mode
select vault.create_secret(
  'test-service-role-key',
  'supabase_service_role_key'
);
select vault.create_secret(
  'testproject123',
  'supabase_project_id'
);

-- Setup: Register a worker function with 6 second heartbeat timeout
select pgflow.track_worker_function('my-function');

-- TEST: Function with recent last_invoked_at is NOT returned (debounce active)
-- Manually set last_invoked_at to now() to simulate recent invocation
update pgflow.worker_functions
set last_invoked_at = now()
where function_name = 'my-function';

-- Simulate production mode (non-local jwt_secret)
set local app.settings.jwt_secret = 'production-secret-different-from-local';
select is(
  (select count(*) from pgflow.ensure_workers()),
  0::bigint,
  'Function with recent last_invoked_at is NOT returned (debounce active)'
);

-- TEST: Function with last_invoked_at beyond heartbeat_timeout IS returned
update pgflow.worker_functions
set last_invoked_at = now() - interval '7 seconds'
where function_name = 'my-function';

select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Function with last_invoked_at beyond timeout IS returned'
);

-- TEST: Function with NULL last_invoked_at IS returned
update pgflow.worker_functions
set last_invoked_at = null
where function_name = 'my-function';

select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Function with NULL last_invoked_at IS returned'
);

-- TEST: Debounce uses heartbeat_timeout_seconds from function config
update pgflow.worker_functions
set heartbeat_timeout_seconds = 3,
    last_invoked_at = now() - interval '4 seconds'
where function_name = 'my-function';

select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Debounce respects function-specific heartbeat_timeout_seconds'
);

select finish();
rollback;
