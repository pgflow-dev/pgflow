-- Test: Dependent step condition unmet with whenUnmet='skip'
-- Verifies that a dependent step with unmet condition is skipped
-- when its dependency output doesn't match the pattern
begin;
select plan(4);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with a root step and a conditional dependent step
select pgflow.create_flow('conditional_flow');
select pgflow.add_step('conditional_flow', 'first');
select pgflow.add_step(
  flow_slug => 'conditional_flow',
  step_slug => 'checked_step',
  deps_slugs => ARRAY['first'],
  required_input_pattern => '{"first": {"success": true}}'::jsonb,  -- first.success must be true
  when_unmet => 'skip'
);

-- Start flow
with flow as (
  select * from pgflow.start_flow('conditional_flow', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Read and start the first step's task
select pgflow_tests.read_and_start('conditional_flow');

-- Complete first step with output that does NOT match condition
select pgflow.complete_task(
  (select run_id from run_ids),
  'first',
  0,
  '{"success": false, "error": "something went wrong"}'::jsonb
);

-- Test 1: checked_step should be 'skipped' (condition unmet)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'skipped',
  'Dependent step with unmet condition should be skipped'
);

-- Test 2: skip_reason should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'condition_unmet',
  'Step should have skip_reason = condition_unmet'
);

-- Test 3: No task should be created
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  0,
  'No task should be created for skipped step'
);

-- Test 4: Run should complete (all steps done)
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'completed',
  'Run should complete when skipped step was the last step'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
