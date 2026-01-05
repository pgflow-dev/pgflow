-- Test: Dependent step condition met - step executes normally
-- Verifies that a dependent step with a condition pattern that matches
-- the aggregated dependency outputs starts normally
begin;
select plan(3);

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

-- Complete first step with output that MATCHES condition
select pgflow.complete_task(
  (select run_id from run_ids),
  'first',
  0,
  '{"success": true, "data": "hello"}'::jsonb
);

-- Test 1: checked_step should be 'started' (condition met)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'started',
  'Dependent step with met condition should start'
);

-- Test 2: skip_reason should be NULL
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  NULL,
  'Step with met condition should have no skip_reason'
);

-- Test 3: Task should be created
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  1,
  'Task should be created for step with met condition'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
