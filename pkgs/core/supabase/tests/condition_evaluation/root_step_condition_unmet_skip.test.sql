-- Test: Root step condition unmet with whenUnmet='skip' - step skipped
-- Verifies that a root step with unmet condition and whenUnmet='skip'
-- is skipped but the run continues
begin;
select plan(5);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with a root step that has a condition
select pgflow.create_flow('conditional_flow');
select pgflow.add_step(
  'conditional_flow',
  'checked_step',
  '{}',  -- no deps (root step)
  null, null, null, null,  -- default options
  'single',  -- step_type
  '{"enabled": true}'::jsonb,  -- condition_pattern: requires enabled=true
  'skip'  -- when_unmet
);
-- Add another root step without condition
select pgflow.add_step('conditional_flow', 'other_step');

-- Start flow with input that does NOT match condition
with flow as (
  select * from pgflow.start_flow('conditional_flow', '{"enabled": false, "value": 42}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: checked_step should be 'skipped' (condition unmet)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'skipped',
  'Step with unmet condition and whenUnmet=skip should be skipped'
);

-- Test 2: skip_reason should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'condition_unmet',
  'Step with unmet condition should have skip_reason = condition_unmet'
);

-- Test 3: No task should be created for skipped step
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  0,
  'No task should be created for skipped step'
);

-- Test 4: other_step should be started (independent root step)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'other_step'),
  'started',
  'Other step without condition should start normally'
);

-- Test 5: Run should continue (not failed)
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'started',
  'Run should continue when step is skipped'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
