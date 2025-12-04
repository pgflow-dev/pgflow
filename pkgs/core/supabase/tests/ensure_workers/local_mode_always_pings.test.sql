-- Test: ensure_workers() in local mode always returns functions (ignores worker state)
begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Register worker function
select pgflow.track_worker_function('my-function');
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Setup: Create an alive worker
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'test_queue', 'my-function', now(), now());

-- Simulate local mode
set local app.settings.jwt_secret = 'super-secret-jwt-token-with-at-least-32-characters-long';

-- TEST: Local mode returns function even with alive worker
select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Local mode returns function even with alive worker'
);

-- TEST: Local mode returns function even when worker has recent heartbeat
update pgflow.workers
set last_heartbeat_at = now()
where worker_id = '11111111-1111-1111-1111-111111111111';

-- Reset last_invoked_at to past again (it was updated by previous call)
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Local mode returns function even when worker has fresh heartbeat'
);

-- TEST: Debounce still applies in local mode
-- Reset last_invoked_at to now (will be within debounce window)
update pgflow.worker_functions
set last_invoked_at = now();

select is(
  (select count(*) from pgflow.ensure_workers()),
  0::bigint,
  'Debounce still applies in local mode'
);

select finish();
rollback;
