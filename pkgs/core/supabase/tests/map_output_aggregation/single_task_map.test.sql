begin;
select plan(4);

-- Test: Single task map (map with exactly 1 task)
-- Map with 1 task should produce array with one element

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_single_task', 10, 60, 3);
select pgflow.add_step('test_single_task', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_single_task', 'consumer', array['map_step'], null, null, null, null, 'single');

-- Start flow with single-element array
select is(
  (select count(*) from pgflow.start_flow('test_single_task', '[42]'::jsonb)),
  1::bigint,
  'Flow should start with single-element array'
);

-- Verify exactly 1 task was created for the map step
select is(
  (select count(*) from pgflow.step_tasks where step_slug = 'map_step'),
  1::bigint,
  'Map step should have exactly 1 task'
);

-- Complete the single map task
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete the single task
  select * into v_task from pgflow_tests.read_and_start('test_single_task', 1, 1);
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    0,  -- task_index 0 (only task)
    jsonb_build_object('processed', 42 * 2)  -- output: {processed: 84}
  );

  -- Trigger dependent step
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify that consumer receives single-element array
select is(
  (select input->'map_step' from pgflow_tests.read_and_start('test_single_task', 1, 1)),
  jsonb_build_array(
    jsonb_build_object('processed', 84)
  ),
  'Consumer should receive single-element array [output]'
);

-- Verify map step is completed
select is(
  (select status from pgflow.step_states
   where step_slug = 'map_step'),
  'completed',
  'Map step with single task should complete successfully'
);

select * from finish();
rollback;