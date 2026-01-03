begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Create a flow with a map step
select pgflow.create_flow('test_single_task_map');
select pgflow.add_step('test_single_task_map', 'map_step', '{}', null, null, null, null, 'map');

-- Start the flow with a 1-element array
select pgflow.start_flow('test_single_task_map', '[42]'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_single_task_map');

-- Complete the single task
with task as (
  select * from pgflow_tests.read_and_start('test_single_task_map') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "only_task"}'::jsonb
) from task;

-- Test 1: Verify the step is completed
select is(
  (select status from pgflow.step_states where step_slug = 'map_step'),
  'completed',
  'Map step should be marked as completed'
);

-- Test 2: Single-task map should produce wrapped array, not just the output
select is(
  (select output from pgflow.step_states where step_slug = 'map_step'),
  '[{"result": "only_task"}]'::jsonb,
  'Single-task map should produce wrapped array [{output}], not just {output}'
);

select * from finish();
rollback;
