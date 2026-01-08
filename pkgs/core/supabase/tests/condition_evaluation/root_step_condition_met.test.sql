-- Test: Root step condition met - step executes normally
-- Verifies that a root step with a condition pattern that matches the flow input
-- starts normally without being skipped
begin;
select plan(3);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with a root step that has a condition
select pgflow.create_flow('conditional_flow');
select pgflow.add_step(
  flow_slug => 'conditional_flow',
  step_slug => 'checked_step',
  condition_pattern => '{"enabled": true}'::jsonb,  -- requires enabled=true
  when_unmet => 'skip'
);

-- Start flow with input that matches condition
with flow as (
  select * from pgflow.start_flow('conditional_flow', '{"enabled": true, "value": 42}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Step should be in 'started' status (condition met, step executes)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'checked_step'),
  'started',
  'Step with met condition should start normally'
);

-- Test 2: skip_reason should be NULL (not skipped)
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
