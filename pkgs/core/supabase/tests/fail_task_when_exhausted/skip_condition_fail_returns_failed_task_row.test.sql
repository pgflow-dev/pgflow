-- Test: fail_task returns task row when condition fails the run
--
-- Flow structure:
--   parent (when_exhausted='skip', max_attempts=0) -> child (condition with when_unmet='fail')
--
-- Expected behavior:
--   1. parent fails and gets skipped
--   2. child's condition fails -> run fails
--   3. fail_task should return the task row (API contract)
--
-- This is a regression test for the bug where early RETURN in fail_task
-- didn't return any row, breaking the API contract.

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create flow: parent -> child with condition and fail mode
select pgflow.create_flow('skip_condition_fail_return');
select pgflow.add_step('skip_condition_fail_return', 'parent', max_attempts => 0, when_exhausted => 'skip');
select pgflow.add_step(
  flow_slug => 'skip_condition_fail_return',
  step_slug => 'child',
  deps_slugs => ARRAY['parent'],
  required_input_pattern => '{"parent": {"success": true}}'::jsonb,
  when_unmet => 'fail'
);

-- Start flow and capture run_id
with flow as (
  select * from pgflow.start_flow('skip_condition_fail_return', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Start the parent task
select pgflow_tests.read_and_start('skip_condition_fail_return');

-- Fail parent task (triggers skip -> condition resolution -> run failure)
-- Capture the return value
select * into temporary fail_result
from pgflow.fail_task(
  (select run_id from run_ids),
  'parent',
  0,
  'handler failed'
);

-- Test 1: fail_task should return exactly one row
select is(
  (select count(*)::int from fail_result),
  1,
  'fail_task should return exactly one row even when condition fails run'
);

-- Test 2: returned row should have correct step_slug
select is(
  (select step_slug from fail_result),
  'parent',
  'Returned row should have correct step_slug'
);

-- Test 3: returned row should have status 'failed' (task was failed)
select is(
  (select status from fail_result),
  'failed',
  'Returned row should have status failed'
);

-- Test 4: run should be failed (proves condition-fail path executed)
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'failed',
  'Run should be failed - proves condition-fail branch executed'
);

-- Test 5: parent step state should be skipped (proves skip->condition path)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'parent'),
  'skipped',
  'Parent step should be skipped - proves skip->condition-fail path'
);

-- Cleanup
drop table if exists run_ids;
drop table if exists fail_result;

select finish();
rollback;
