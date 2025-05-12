begin;
select plan(4);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create test flows
select pgflow.create_flow('old_failed_flow', max_attempts => 0);
select pgflow.add_step('old_failed_flow', 'step');

select pgflow.create_flow('recent_failed_flow', max_attempts => 0);
select pgflow.add_step('recent_failed_flow', 'step');

select pgflow.create_flow('running_old_flow', max_attempts => 0);
select pgflow.add_step('running_old_flow', 'step');

-- Start and fail flows
select pgflow.start_flow('old_failed_flow', '{}'::jsonb);
select pgflow_tests.poll_and_fail('old_failed_flow');

select pgflow.start_flow('recent_failed_flow', '{}'::jsonb);
select pgflow_tests.poll_and_fail('recent_failed_flow');

select pgflow.start_flow('running_old_flow', '{}'::jsonb);

-- Set timestamps to simulate age
-- Old failed flow: 31 days old
select pgflow_tests.set_failed_flow_timestamps('old_failed_flow', 31);

-- Recent failed flow: 25 days old (within 30-day retention)
select pgflow_tests.set_failed_flow_timestamps('recent_failed_flow', 25);

-- Running flow: 40 days old but still running (should not be pruned)
select pgflow_tests.set_running_flow_timestamps('running_old_flow', 40);

-- Verify setup
select is(
  (select count(*) from pgflow.runs),
  3::bigint,
  'Should have 3 runs before pruning'
);

-- Prune old records with 30-day retention
select pgflow.prune_data_older_than(30);

-- TEST: Only the old failed flow should be pruned
select is(
  (select array_agg(flow_slug order by flow_slug) from pgflow.runs),
  array['recent_failed_flow', 'running_old_flow'],
  'Only old failed flow should be pruned'
);

-- TEST: Step states for old failed flow should be pruned
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'old_failed_flow'),
  0::bigint,
  'Step states for old failed flow should be pruned'
);

-- TEST: Step tasks for old failed flow should be pruned
select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'old_failed_flow'),
  0::bigint,
  'Step tasks for old failed flow should be pruned'
);

select finish();
rollback;
