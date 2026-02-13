-- Test: Plain skip resolves dependent conditions before starting steps (child when_unmet='fail')
--
-- Flow structure:
--   parent (when_exhausted='skip', max_attempts=0) -> child
--
-- The child has a required_input_pattern that won't be met when parent is skipped.
-- Expected behavior:
--   1. parent fails and gets skipped
--   2. child should be condition-resolved (failed due to unmet condition), NOT started
--   3. Run fails

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create flow: parent -> child with condition and fail mode
select pgflow.create_flow('skip_parent_conditional_child_fail');
select pgflow.add_step('skip_parent_conditional_child_fail', 'parent', max_attempts => 0, when_exhausted => 'skip');
select pgflow.add_step(
  flow_slug => 'skip_parent_conditional_child_fail',
  step_slug => 'child',
  deps_slugs => ARRAY['parent'],
  required_input_pattern => '{"parent": {"success": true}}'::jsonb,
  when_unmet => 'fail'
);

-- Start flow and capture run_id
with flow as (
  select * from pgflow.start_flow('skip_parent_conditional_child_fail', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Start the parent task
select pgflow_tests.read_and_start('skip_parent_conditional_child_fail');

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

-- Test 2: child should be condition-failed, NOT started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'child'),
  'failed',
  'child should be failed due to unmet condition, not started'
);

-- Test 3: child error_message should indicate condition failure
select ok(
  (select error_message like '%Condition not met%'
   from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'child'),
  'child should have error_message about condition not met'
);

-- Test 4: No task should be created for child
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = (select run_id from run_ids) and step_slug = 'child'),
  0,
  'No task should be created for child'
);

-- Test 5: Run should fail
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'failed',
  'Run should fail when child has unmet condition with when_unmet=fail'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
