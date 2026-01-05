-- Test: Step with no condition (NULL pattern) always executes
-- Verifies that steps without condition_pattern execute normally
-- regardless of input content
begin;
select plan(2);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with a step that has no condition (default)
select pgflow.create_flow('simple_flow');
select pgflow.add_step('simple_flow', 'unconditioned');

-- Start flow with any input
with flow as (
  select * from pgflow.start_flow('simple_flow', '{"anything": "goes"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Step should be started (no condition means always execute)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'unconditioned'),
  'started',
  'Step with no condition should start regardless of input'
);

-- Test 2: Task should be created
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'unconditioned'),
  1,
  'Task should be created for step with no condition'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
