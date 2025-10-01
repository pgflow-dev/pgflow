begin;
select plan(5);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create a flow with 2 steps
select pgflow.create_flow('pgmq_test_flow', max_attempts => 0);
select pgflow.add_step('pgmq_test_flow', 'step1');
select pgflow.add_step('pgmq_test_flow', 'step2', ARRAY['step1']);

-- Start the flow - this creates PGMQ messages for step1
select pgflow.start_flow('pgmq_test_flow', '{}'::jsonb);

-- Manually fail the run without consuming the PGMQ message
-- This simulates a situation where the run failed but messages remain in the queue
update pgflow.runs
set status = 'failed',
    failed_at = now()
where flow_slug = 'pgmq_test_flow';

update pgflow.step_states
set status = 'failed',
    failed_at = now()
where flow_slug = 'pgmq_test_flow' and step_slug = 'step1';

-- Verify PGMQ queue exists and contains messages
select is(
  (select count(*) > 0 from pgmq.q_pgmq_test_flow),
  true,
  'PGMQ queue should exist with messages before pruning'
);

-- Age the failed run to make it eligible for pruning
update pgflow.runs
set
  started_at = now() - interval '31 days',
  failed_at = now() - interval '31 days'
where flow_slug = 'pgmq_test_flow';

update pgflow.step_states
set
  created_at = now() - interval '31 days',
  started_at = now() - interval '31 days' + interval '1 minute',
  failed_at = now() - interval '31 days' + interval '2 minutes'
where flow_slug = 'pgmq_test_flow' and step_slug = 'step1';

update pgflow.step_tasks
set
  queued_at = now() - interval '31 days'
where flow_slug = 'pgmq_test_flow' and step_slug = 'step1';

-- Verify setup
select is(
  (select count(*) from pgflow.runs where flow_slug = 'pgmq_test_flow'),
  1::bigint,
  'Should have 1 run before pruning'
);

select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'pgmq_test_flow'),
  1::bigint,
  'Should have 1 step_task before pruning'
);

-- Prune old records
-- This should delete PGMQ messages BEFORE deleting step_tasks
select pgflow.prune_data_older_than(make_interval(days => 30));

-- TEST: All database records deleted
select is(
  (select count(*) from pgflow.runs where flow_slug = 'pgmq_test_flow'),
  0::bigint,
  'Run should be deleted after pruning'
);

-- TEST: PGMQ messages deleted (queue should be empty)
select is(
  (select count(*) from pgmq.q_pgmq_test_flow),
  0::bigint,
  'PGMQ queue should be empty after pruning'
);

select finish();
rollback;