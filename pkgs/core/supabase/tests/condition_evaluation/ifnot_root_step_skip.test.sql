-- Test: ifNot pattern MATCHES (condition not met) with whenUnmet='skip'
-- Step should be skipped but run continues
begin;
select plan(5);

select pgflow_tests.reset_db();

-- Create flow with a root step that has ifNot condition
select pgflow.create_flow('ifnot_skip_flow');
select pgflow.add_step(
  flow_slug => 'ifnot_skip_flow',
  step_slug => 'no_admin_step',
  forbidden_input_pattern => '{"role": "admin"}'::jsonb,  -- must NOT contain role=admin
  when_unmet => 'skip'
);
-- Add another root step without condition
select pgflow.add_step('ifnot_skip_flow', 'other_step');

-- Start flow with input that MATCHES the ifNot pattern (role=admin)
-- The ifNot condition is NOT met, so step should be skipped
with flow as (
  select * from pgflow.start_flow('ifnot_skip_flow', '{"role": "admin", "name": "Alice"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: no_admin_step should be 'skipped'
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  'skipped',
  'Step with matched ifNot pattern and whenUnmet=skip should be skipped'
);

-- Test 2: skip_reason should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  'condition_unmet',
  'Skip reason should be condition_unmet'
);

-- Test 3: No task should be created for skipped step
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  0,
  'No task should be created for skipped step'
);

-- Test 4: other_step should be started normally
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

drop table if exists run_ids;

select finish();
rollback;
