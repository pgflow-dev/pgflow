-- Test: Root step condition unmet with whenUnmet='fail' - run fails
-- Verifies that a root step with unmet condition and whenUnmet='fail'
-- causes the run to fail immediately
begin;
select plan(4);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with a root step that has a condition with fail mode
select pgflow.create_flow('conditional_flow');
select pgflow.add_step(
  flow_slug => 'conditional_flow',
  step_slug => 'checked_step',
  required_input_pattern => '{"enabled": true}'::jsonb,  -- requires enabled=true
  when_unmet => 'fail'  -- causes run to fail
);

-- Start flow with input that does NOT match condition
with flow as (
  select * from pgflow.start_flow('conditional_flow', '{"enabled": false, "value": 42}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: checked_step should be 'failed' (condition unmet + fail mode)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'failed',
  'Step with unmet condition and whenUnmet=fail should be failed'
);

-- Test 2: error_message should indicate condition unmet
select ok(
  (select error_message from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step') ILIKE '%condition%',
  'Failed step should have error message about condition'
);

-- Test 3: No task should be created
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  0,
  'No task should be created for failed step'
);

-- Test 4: Run should be failed
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'failed',
  'Run should fail when step condition fails with fail mode'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
