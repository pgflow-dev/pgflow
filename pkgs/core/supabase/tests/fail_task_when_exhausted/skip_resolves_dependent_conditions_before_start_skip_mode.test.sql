-- Test: Plain skip resolves dependent conditions before starting steps (child when_unmet='skip')
--
-- Flow structure:
--   parent (when_exhausted='skip', max_attempts=0) -> child
--
-- The child has a required_input_pattern that won't be met when parent is skipped.
-- Expected behavior:
--   1. parent fails and gets skipped
--   2. child should be condition-resolved (skipped due to unmet condition), NOT started
--   3. Run completes successfully

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create flow: parent -> child with condition
select pgflow.create_flow('skip_parent_conditional_child_skip');
select pgflow.add_step('skip_parent_conditional_child_skip', 'parent', max_attempts => 0, when_exhausted => 'skip');
select pgflow.add_step(
  flow_slug => 'skip_parent_conditional_child_skip',
  step_slug => 'child',
  deps_slugs => ARRAY['parent'],
  required_input_pattern => '{"parent": {"success": true}}'::jsonb,
  when_unmet => 'skip'
);

-- Start flow and capture run_id
with flow as (
  select * from pgflow.start_flow('skip_parent_conditional_child_skip', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Start the parent task
select pgflow_tests.read_and_start('skip_parent_conditional_child_skip');

-- Fail parent task
select pgflow.fail_task(
  (select run_id from run_ids),
  'parent',
  0,
  'handler failed'
);

-- Test 1: parent should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'parent'),
  'skipped',
  'parent should be skipped after failure'
);

-- Test 2: child should be condition-skipped, NOT started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'child'),
  'skipped',
  'child should be skipped due to unmet condition, not started'
);

-- Test 3: child skip_reason should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'child'),
  'condition_unmet',
  'child should have skip_reason = condition_unmet'
);

-- Test 4: No task should be created for child
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'child'),
  0,
  'No task should be created for child'
);

-- Test 5: Run should complete successfully
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'completed',
  'Run should complete when child is skipped'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
