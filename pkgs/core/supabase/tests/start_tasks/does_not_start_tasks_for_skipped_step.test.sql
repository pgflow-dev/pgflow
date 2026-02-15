begin;

select plan(5);
select pgflow_tests.reset_db();

-- Test: start_tasks must reject queued tasks from skipped steps
-- Setup: map_a root map with max_attempts=0, when_exhausted='skip'
--        other independent root step (keeps run started)
-- Scenario: Fail map_a[0] -> map_a becomes skipped
--           Try to start queued map_a[1]
-- Expected: start_tasks returns 0 rows for map_a[1]

-- Create flow with two independent root steps
select pgflow.create_flow('skip_start_guard');
select pgflow.add_step('skip_start_guard', 'map_a', '{}', max_attempts=>0, step_type=>'map', when_exhausted=>'skip');
select pgflow.add_step('skip_start_guard', 'other', '{}');

-- Start flow with array [1,2] so map_a has 2 tasks
select pgflow.start_flow('skip_start_guard', '[1,2]'::jsonb);

-- Start only map_a[0] by selecting its message_id and passing to start_tasks
with task0 as (
  select message_id
  from pgflow.step_tasks
  where flow_slug = 'skip_start_guard' and step_slug = 'map_a' and task_index = 0
)
select is(
  (select count(*) from pgflow.start_tasks('skip_start_guard', array[(select message_id from task0)::bigint], pgflow_tests.ensure_worker('skip_start_guard'))),
  1::bigint,
  'Should start 1 task for map_a[0]'
);

-- Verify map_a[0] is started
select is(
  (select status from pgflow.step_tasks where flow_slug = 'skip_start_guard' and step_slug = 'map_a' and task_index = 0),
  'started',
  'map_a[0] should be started'
);

-- Verify map_a[1] is still queued
select is(
  (select status from pgflow.step_tasks where flow_slug = 'skip_start_guard' and step_slug = 'map_a' and task_index = 1),
  'queued',
  'map_a[1] should be queued'
);

-- Fail map_a[0] to trigger skip (max_attempts=0, when_exhausted='skip')
select pgflow.fail_task(
  (select run_id from pgflow.runs where flow_slug = 'skip_start_guard'),
  'map_a',
  0,
  'handler_failed'
);

-- Verify map_a step is now skipped
select is(
  (select status from pgflow.step_states where flow_slug = 'skip_start_guard' and step_slug = 'map_a'),
  'skipped',
  'map_a step should be skipped after task 0 fails'
);

-- Attempt to start queued sibling map_a[1] using its message_id
-- Expected: start_tasks returns 0 rows (blocked by step state guard)
with task1 as (
  select message_id
  from pgflow.step_tasks
  where flow_slug = 'skip_start_guard' and step_slug = 'map_a' and task_index = 1
)
select is(
  (select count(*) from pgflow.start_tasks('skip_start_guard', array[(select message_id from task1)::bigint], pgflow_tests.ensure_worker('skip_start_guard'))),
  0::bigint,
  'Should NOT start task for map_a[1] when step is skipped'
);

select * from finish();
rollback;
