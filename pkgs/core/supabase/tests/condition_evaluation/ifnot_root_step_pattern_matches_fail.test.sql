-- Test: ifNot pattern MATCHES (negative condition fails) with whenUnmet='fail'
-- When ifNot pattern MATCHES the input, the condition is NOT met (pattern should NOT match)
-- With whenUnmet='fail', this should fail the step and run
begin;
select plan(4);

select pgflow_tests.reset_db();

-- Create flow with a root step that has ifNot condition
select pgflow.create_flow('ifnot_fail_flow');
select pgflow.add_step(
  flow_slug => 'ifnot_fail_flow',
  step_slug => 'no_admin_step',
  forbidden_input_pattern => '{"role": "admin"}'::jsonb,  -- must NOT contain role=admin
  when_unmet => 'fail'
);

-- Start flow with input that MATCHES the ifNot pattern (role=admin)
-- Since input @> pattern, the ifNot condition is NOT met
with flow as (
  select * from pgflow.start_flow('ifnot_fail_flow', '{"role": "admin", "name": "Alice"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Step should be 'failed' (ifNot condition not met because pattern matched)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  'failed',
  'Step with matched ifNot pattern and whenUnmet=fail should be failed'
);

-- Test 2: Error message should indicate condition not met
select is(
  (select error_message from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  'Condition not met',
  'Error message should indicate condition not met'
);

-- Test 3: No task should be created for failed step
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  0,
  'No task should be created for failed step'
);

-- Test 4: Run should be 'failed'
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'failed',
  'Run should be failed when step fails due to unmet ifNot condition'
);

drop table if exists run_ids;

select finish();
rollback;
