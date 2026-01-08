-- Test: ifNot pattern does NOT match - step should execute
-- When ifNot pattern does NOT match the input, the condition IS met
-- The step should execute normally
begin;
select plan(3);

select pgflow_tests.reset_db();

-- Create flow with a root step that has ifNot condition
select pgflow.create_flow('ifnot_pass_flow');
select pgflow.add_step(
  flow_slug => 'ifnot_pass_flow',
  step_slug => 'no_admin_step',
  condition_not_pattern => '{"role": "admin"}'::jsonb,  -- must NOT contain role=admin
  when_unmet => 'fail'  -- (doesn't matter for this test since condition is met)
);

-- Start flow with input that does NOT match the ifNot pattern (role=user)
-- Since input does NOT contain role=admin, the ifNot condition IS met
with flow as (
  select * from pgflow.start_flow('ifnot_pass_flow', '{"role": "user", "name": "Bob"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Step should be 'started' (condition met, step executes)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  'started',
  'Step should start when ifNot pattern does not match input'
);

-- Test 2: Task should be created for the step
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  1,
  'Task should be created for step when condition is met'
);

-- Test 3: Run should be 'started'
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'started',
  'Run should continue when ifNot condition is met'
);

drop table if exists run_ids;

select finish();
rollback;
