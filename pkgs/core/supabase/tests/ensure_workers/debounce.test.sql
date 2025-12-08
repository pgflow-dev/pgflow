-- Test: ensure_workers() respects debounce window
begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Register a worker function with 6 second heartbeat timeout
select pgflow.track_worker_function('my-function');

-- TEST: Function with recent last_invoked_at is NOT returned (debounce active)
-- Manually set last_invoked_at to now() to simulate recent invocation
update pgflow.worker_functions
set last_invoked_at = now()
where function_name = 'my-function';

set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
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
