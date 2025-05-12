begin;
select plan(3);
select pgflow_tests.reset_db();

-- Load the prune_old_records function
\i _shared/prune_old_records.sql
\i _shared/prune_test_helper.sql

-- Create workers with different timestamps
insert into pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
values 
  ('11111111-1111-1111-1111-111111111111', 'old_worker', 'test_function', now() - interval '8 days'),
  ('22222222-2222-2222-2222-222222222222', 'recent_worker', 'test_function', now()),
  ('33333333-3333-3333-3333-333333333333', 'edge_case_worker', 'test_function', now() - interval '7 days' + interval '1 minute');

-- Verify the setup: we should have 3 workers
select is(
  (select count(*) from pgflow.workers),
  3::bigint,
  'Should have 3 workers initially'
);

-- TEST: Run pruning with a 7-day retention - only old worker should be pruned
select pgflow.prune_old_records(7);

select is(
  (select count(*) from pgflow.workers),
  2::bigint,
  'Only old worker should be pruned with 7-day retention, leaving two workers'
);

-- TEST: Check which workers remain - should be the recent and edge case workers
select is(
  (select array_agg(queue_name order by queue_name) from pgflow.workers),
  array['edge_case_worker', 'recent_worker'],
  'Only the recent worker and the edge case worker should remain'
);

select finish();
rollback;