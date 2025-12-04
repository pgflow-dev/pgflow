-- Test: mark_worker_stopped() sets stopped_at on the worker row
begin;
select plan(3);

-- Setup: Create a worker entry
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'test_queue', 'test_function', now(), now());

-- Verify worker exists and stopped_at is NULL
select is(
  (select stopped_at from pgflow.workers where worker_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'Worker should have NULL stopped_at initially'
);

-- Execute: Mark worker as stopped
select pgflow.mark_worker_stopped('11111111-1111-1111-1111-111111111111'::uuid);

-- Test: stopped_at should be set
select isnt(
  (select stopped_at from pgflow.workers where worker_id = '11111111-1111-1111-1111-111111111111'),
  null,
  'Worker should have stopped_at set after marking stopped'
);

-- Test: stopped_at should be recent (within last second)
select ok(
  (select stopped_at > clock_timestamp() - interval '1 second'
   from pgflow.workers
   where worker_id = '11111111-1111-1111-1111-111111111111'),
  'stopped_at should be recent (within last second)'
);

select finish();
rollback;
