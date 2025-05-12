begin;
select plan(4);
select pgflow_tests.reset_db();

-- Load the prune_old_records function
\i _shared/prune_old_records.sql.raw

-- Create workers with different timestamps
insert into pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
values
('11111111-1111-1111-1111-111111111111', 'old_worker', 'test_function', now() - interval '8 days'),
('22222222-2222-2222-2222-222222222222', 'recent_worker', 'test_function', now()),
(
  '33333333-3333-3333-3333-333333333333',
  'edge_case_worker',
  'test_function',
  now() - interval '7 days' + interval '1 minute'
),
('44444444-4444-4444-4444-444444444444', 'exact_cutoff_worker', 'test_function', now() - interval '7 days');

-- Verify the setup: we should have 4 workers
select is(
  (select count(*) from pgflow.workers),
  4::bigint,
  'Should have 4 workers initially'
);

-- TEST: Run pruning with a 7-day retention - only old worker should be pruned
select pgflow.prune_old_records(7);

select is(
  (select count(*) from pgflow.workers),
  3::bigint,
  'Only old worker should be pruned with 7-day retention, leaving three workers'
);

-- TEST: Check that the exact cutoff worker is not pruned (should be kept)
select is(
  (select exists(select 1 from pgflow.workers where queue_name = 'exact_cutoff_worker')),
  true,
  'Worker at exactly the cutoff should not be pruned'
);

-- TEST: Check which workers remain - should be the recent, edge case, and exact cutoff workers
select is(
  (select array_agg(queue_name order by queue_name) from pgflow.workers),
  array['edge_case_worker', 'exact_cutoff_worker', 'recent_worker'],
  'The recent worker, edge case worker, and exact cutoff worker should remain'
);

select finish();
rollback;
