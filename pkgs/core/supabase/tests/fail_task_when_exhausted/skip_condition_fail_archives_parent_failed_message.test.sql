-- Test: Plain skip archives parent task message when condition fails the run
--
-- Flow structure:
--   parent (when_exhausted='skip', max_attempts=0) -> child (condition with when_unmet='fail')
--
-- Expected behavior:
--   1. parent fails and gets skipped
--   2. child's condition fails -> run fails
--   3. Parent's message should be archived (not orphaned)
--
-- This is a regression test for the bug where early RETURN in fail_task
-- left the parent task's message orphaned in the queue.

begin;
select plan(4);
select pgflow_tests.reset_db();

-- Create flow: parent -> child with condition and fail mode
select pgflow.create_flow('skip_condition_fail_archive');
select pgflow.add_step('skip_condition_fail_archive', 'parent', max_attempts => 0, when_exhausted => 'skip');
select pgflow.add_step(
  flow_slug => 'skip_condition_fail_archive',
  step_slug => 'child',
  deps_slugs => ARRAY['parent'],
  required_input_pattern => '{"parent": {"success": true}}'::jsonb,
  when_unmet => 'fail'
);

-- Start flow and capture run_id
with flow as (
  select * from pgflow.start_flow('skip_condition_fail_archive', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Start the parent task
select pgflow_tests.read_and_start('skip_condition_fail_archive');

-- Fail parent task (triggers skip -> condition resolution -> run failure)
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

-- Test 2: run should be failed
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'failed',
  'Run should fail when child condition fails'
);

-- Test 3: queue should be empty (parent message archived, not orphaned)
select is(
  (select count(*) from pgmq.q_skip_condition_fail_archive),
  0::bigint,
  'Queue should be empty - parent message archived, not orphaned'
);

-- Test 4: message should exist in archive table (prove it was archived, not just deleted)
select is(
  (select count(*)::int from pgmq.a_skip_condition_fail_archive),
  1,
  'Message should exist in archive table - proves proper archival'
);

-- Cleanup
drop table if exists run_ids;

select finish();
rollback;
