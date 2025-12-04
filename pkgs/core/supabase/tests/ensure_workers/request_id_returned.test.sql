-- Test: ensure_workers() returns request_id in result
begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');

-- Set last_invoked_at to past (beyond debounce window)
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate local mode (will use local fallback credentials)
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

-- TEST: Result includes request_id column (verify by selecting it)
with result as (
  select function_name, invoked, request_id from pgflow.ensure_workers()
)
select ok(
  (select count(*) = 1 from result where request_id is not null),
  'ensure_workers() returns request_id column'
);

-- Reset debounce for next test
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- TEST: request_id is NOT NULL when function is invoked
with result as (
  select * from pgflow.ensure_workers()
)
select ok(
  (select request_id is not null from result where function_name = 'my-function'),
  'request_id is NOT NULL when function is invoked'
);

-- TEST: request_id is a valid bigint (positive number from pg_net)
-- Reset debounce for next call
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

with result as (
  select * from pgflow.ensure_workers()
)
select ok(
  (select request_id > 0 from result where function_name = 'my-function'),
  'request_id is a positive bigint from pg_net'
);

select finish();
rollback;
