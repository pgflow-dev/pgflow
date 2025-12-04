-- Test: ensure_workers() skips disabled functions
begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Register worker functions
select pgflow.track_worker_function('enabled-function');
select pgflow.track_worker_function('disabled-function');

-- Disable one function
update pgflow.worker_functions
set enabled = false
where function_name = 'disabled-function';

-- Set last_invoked_at to past (beyond debounce window) for both
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- TEST: Only enabled functions are returned
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

-- Use a CTE to capture results in one call (avoid debounce between assertions)
with results as (
  select * from pgflow.ensure_workers()
)
select is(
  (select count(*) from results),
  1::bigint,
  'Only enabled functions are returned'
);

-- Reset debounce for second test
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

select is(
  (select count(*) from pgflow.ensure_workers() where ensure_workers.function_name = 'enabled-function'),
  1::bigint,
  'Enabled function is returned'
);

select finish();
rollback;
