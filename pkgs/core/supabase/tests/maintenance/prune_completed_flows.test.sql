begin;
select plan(4);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create test flows
select pgflow.create_flow('old_completed_flow', max_attempts => 0);
select pgflow.add_step('old_completed_flow', 'step');

select pgflow.create_flow('recent_completed_flow', max_attempts => 0);
select pgflow.add_step('recent_completed_flow', 'step');

select pgflow.create_flow('running_old_flow', max_attempts => 0);
select pgflow.add_step('running_old_flow', 'step');

-- Start and complete flows
select pgflow.start_flow('old_completed_flow', '{}'::jsonb);
select pgflow_tests.poll_and_complete('old_completed_flow');

select pgflow.start_flow('recent_completed_flow', '{}'::jsonb);
select pgflow_tests.poll_and_complete('recent_completed_flow');

select pgflow.start_flow('running_old_flow', '{}'::jsonb);

-- Set timestamps to simulate age
-- Old completed flow: 31 days old
select pgflow_tests.set_completed_flow_timestamps('old_completed_flow', 31);

-- Recent completed flow: 25 days old (within 30-day retention)
select pgflow_tests.set_completed_flow_timestamps('recent_completed_flow', 25);

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

-- TEST: Only the old completed flow should be pruned
select is(
  (select array_agg(flow_slug order by flow_slug) from pgflow.runs),
  array['recent_completed_flow', 'running_old_flow'],
  'Only old completed flow should be pruned'
);

-- TEST: Step states for old completed flow should be pruned
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'old_completed_flow'),
  0::bigint,
  'Step states for old completed flow should be pruned'
);

-- TEST: Step tasks for old completed flow should be pruned
select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'old_completed_flow'),
  0::bigint,
  'Step tasks for old completed flow should be pruned'
);

select finish();
rollback;
