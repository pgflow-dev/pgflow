-- Test: Late complete after step is skipped should not mutate step or run state
-- Verifies defense-in-depth: callbacks cannot change state after step is no longer started
begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Create flow with map_a (skip on exhaust) and independent 'other' step
select pgflow.create_flow('late_complete_test');
select pgflow.add_step(
  flow_slug => 'late_complete_test',
  step_slug => 'map_a',
  step_type => 'map',
  max_attempts => 0,
  when_exhausted => 'skip'
);
select pgflow.add_step(
  flow_slug => 'late_complete_test',
  step_slug => 'other'
);

-- Start flow with 2 array elements for map_a (root map gets array directly)
select run_id as test_run_id from pgflow.start_flow('late_complete_test', '[1, 2]'::jsonb) \gset

-- Ensure worker exists
select pgflow_tests.ensure_worker('late_complete_test') as test_worker_id \gset

-- Start both map_a tasks
select message_id as msg_0 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and task_index = 0 \gset

select pgflow.start_tasks('late_complete_test', array[:'msg_0'::bigint], :'test_worker_id'::uuid);

select message_id as msg_1 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and task_index = 1 \gset

select pgflow.start_tasks('late_complete_test', array[:'msg_1'::bigint], :'test_worker_id'::uuid);

-- Fail map_a[0] to trigger skip (max_attempts=0, when_exhausted='skip')
-- This makes the step transition to 'skipped'
select pgflow.fail_task(
  :'test_run_id'::uuid,
  'map_a',
  0,
  'Task 0 failed!'
);

-- Verify step became skipped
select is(
  (select status from pgflow.step_states
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a'),
  'skipped',
  'Step should be skipped after fail with when_exhausted=skip'
);

-- Capture remaining_steps after skip
select remaining_steps as remaining_steps_after_skip
from pgflow.runs
where run_id = :'test_run_id'::uuid \gset

-- LATE COMPLETE: Try to complete map_a[1] after step is already skipped
-- This should NOT mutate step or run state
select lives_ok(
  format($$
    select pgflow.complete_task(
      '%s'::uuid,
      'map_a',
      1,
      '{"ok":true}'::jsonb
    )
  $$, :'test_run_id'),
  'Late complete should not error'
);

-- Verify step state unchanged (remains skipped)
select is(
  (select status from pgflow.step_states
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a'),
  'skipped',
  'Step should remain skipped after late complete'
);

-- Verify remaining_steps unchanged by late complete
select is(
  (select remaining_steps from pgflow.runs where run_id = :'test_run_id'::uuid),
  :remaining_steps_after_skip,
  'remaining_steps should not be decremented by late complete'
);

select * from finish();
rollback;
