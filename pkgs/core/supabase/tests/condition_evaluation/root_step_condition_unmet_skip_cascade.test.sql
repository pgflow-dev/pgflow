-- Test: Root step condition unmet with whenUnmet='skip-cascade' - step and dependents skipped
-- Verifies that a root step with unmet condition and whenUnmet='skip-cascade'
-- skips the step AND all its dependents
begin;
select plan(6);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with a root step that has a condition and a dependent
select pgflow.create_flow('conditional_flow');
select pgflow.add_step(
  flow_slug => 'conditional_flow',
  step_slug => 'checked_step',
  condition_pattern => '{"enabled": true}'::jsonb,
  when_unmet => 'skip-cascade'  -- skip this AND dependents
);
select pgflow.add_step(
  flow_slug => 'conditional_flow',
  step_slug => 'dependent_step',
  deps_slugs => ARRAY['checked_step']
);
-- Add an independent root step that should still run
select pgflow.add_step('conditional_flow', 'other_step');

-- Start flow with input that does NOT match condition
with flow as (
  select * from pgflow.start_flow('conditional_flow', '{"enabled": false}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: checked_step should be 'skipped'
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'skipped',
  'Step with unmet condition and skip-cascade should be skipped'
);

-- Test 2: checked_step skip_reason should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'condition_unmet',
  'Original step should have skip_reason = condition_unmet'
);

-- Test 3: dependent_step should be 'skipped' (cascaded)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'dependent_step'),
  'skipped',
  'Dependent step should be skipped due to cascade'
);

-- Test 4: dependent_step skip_reason should be 'dependency_skipped'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'dependent_step'),
  'dependency_skipped',
  'Cascaded step should have skip_reason = dependency_skipped'
);

-- Test 5: other_step should be started (independent)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'other_step'),
  'started',
  'Independent step should start normally'
);

-- Test 6: Run should continue (remaining_steps decremented by skipped steps)
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'started',
  'Run should continue after skip-cascade'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
