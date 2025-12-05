-- Test: ensure_workers() updates last_invoked_at for returned functions
begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Register worker functions
select pgflow.track_worker_function('function-a');
select pgflow.track_worker_function('function-b');

-- Set last_invoked_at to past for both
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Store original last_invoked_at values
select last_invoked_at as original_ts
into temporary original_timestamps
from pgflow.worker_functions
where function_name = 'function-a';

-- Small delay to ensure timestamp difference
select pg_sleep(0.01);

-- Simulate local mode to ensure both functions are returned
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

-- Execute ensure_workers()
select * from pgflow.ensure_workers();

-- TEST: last_invoked_at is updated for invoked functions
select ok(
  (select last_invoked_at > (select original_ts from original_timestamps)
   from pgflow.worker_functions
   where function_name = 'function-a'),
  'last_invoked_at is updated after ensure_workers() returns function'
);

-- TEST: last_invoked_at is recent (within last second)
select ok(
  (select last_invoked_at > now() - interval '1 second'
   from pgflow.worker_functions
   where function_name = 'function-a'),
  'last_invoked_at is updated to approximately now'
);

-- Setup: Disable function-b to ensure it is NOT returned
update pgflow.worker_functions
set enabled = false, last_invoked_at = now() - interval '10 seconds'
where function_name = 'function-b';

-- Store function-b's last_invoked_at
update original_timestamps
set original_ts = (select last_invoked_at from pgflow.worker_functions where function_name = 'function-b');

select pg_sleep(0.01);

-- Re-run ensure_workers
select * from pgflow.ensure_workers();

-- TEST: last_invoked_at is NOT updated for functions that were NOT returned
select is(
  (select last_invoked_at from pgflow.worker_functions where function_name = 'function-b'),
  (select original_ts from original_timestamps),
  'last_invoked_at is NOT updated for disabled functions'
);

-- Cleanup
drop table if exists original_timestamps;

select finish();
rollback;
