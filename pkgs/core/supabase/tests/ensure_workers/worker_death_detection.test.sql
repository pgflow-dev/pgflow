-- Test: ensure_workers() detects dead workers in production mode
begin;
select plan(5);
select pgflow_tests.reset_db();

-- Setup: Create Vault secrets for production mode tests
select vault.create_secret('test-service-role-key', 'pgflow_service_role_key');
select vault.create_secret('http://test.example.com/functions/v1', 'pgflow_function_base_url');

-- Setup: Register a worker function
select pgflow.track_worker_function('my-function');
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- Simulate production mode by setting jwt_secret to a different value
set local app.settings.jwt_secret = 'production-secret-different-from-local';

-- Setup: Create a worker
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'test_queue', 'my-function', now(), now());

-- TEST: Function with alive worker is NOT returned in production
select is(
  (select count(*) from pgflow.ensure_workers()),
  0::bigint,
  'Function with alive worker is NOT returned in production'
);

-- TEST: Function with stopped worker IS returned
update pgflow.workers
set stopped_at = now()
where worker_id = '11111111-1111-1111-1111-111111111111';

-- Reset debounce
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Function with stopped worker IS returned'
);

-- Reset stopped_at, set deprecated_at instead
update pgflow.workers
set stopped_at = null, deprecated_at = now()
where worker_id = '11111111-1111-1111-1111-111111111111';

-- Reset debounce
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- TEST: Function with deprecated worker IS returned
select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Function with deprecated worker IS returned'
);

-- Reset deprecated_at, make heartbeat stale
update pgflow.workers
set deprecated_at = null,
    last_heartbeat_at = now() - interval '10 seconds'
where worker_id = '11111111-1111-1111-1111-111111111111';

-- Reset debounce
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

-- TEST: Function with stale heartbeat worker IS returned
select is(
  (select count(*) from pgflow.ensure_workers()),
  1::bigint,
  'Function with stale heartbeat worker IS returned'
);

-- TEST: Mix of alive and dead workers - function with at least one alive is NOT returned
-- Reset first worker to dead
update pgflow.workers
set stopped_at = now()
where worker_id = '11111111-1111-1111-1111-111111111111';

-- Add an alive worker for same function
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
values ('22222222-2222-2222-2222-222222222222', 'test_queue', 'my-function', now(), now());

-- Reset debounce
update pgflow.worker_functions
set last_invoked_at = now() - interval '10 seconds';

select is(
  (select count(*) from pgflow.ensure_workers()),
  0::bigint,
  'Function with at least one alive worker is NOT returned (even if other workers are dead)'
);

select finish();
rollback;
