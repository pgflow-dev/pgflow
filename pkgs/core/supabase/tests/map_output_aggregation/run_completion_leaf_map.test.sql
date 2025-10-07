begin;
select plan(3);

-- Test: Run completion with map step as leaf
-- The run output should contain aggregated map outputs

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_leaf', 10, 60, 3);
select pgflow.add_step('test_leaf', 'map_leaf', '{}', null, null, null, null, 'map');

-- Start flow with 3-item array
select is(
  (select count(*) from pgflow.start_flow('test_leaf', '["first", "second", "third"]'::jsonb)),
  1::bigint,
  'Flow should start with 3-element array'
);

-- Complete all map tasks
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
  v_inputs text[] := array['first', 'second', 'third'];
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete all 3 tasks
  for i in 1..3 loop
    select * into v_task from pgflow_tests.read_and_start('test_leaf', 1, 1);

    -- Get task_index
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Complete with uppercase transformation
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      to_jsonb(upper(v_inputs[v_task_index + 1]))
    );
  end loop;

  -- Run should auto-complete when all leaf tasks complete
  -- Call maybe_complete_run to ensure completion
  perform pgflow.maybe_complete_run(v_run_id);
end $$;

-- Check run is completed
select is(
  (select status from pgflow.runs limit 1),
  'completed',
  'Run should be completed'
);

-- Check run output contains aggregated map outputs
select is(
  (select output->'map_leaf' from pgflow.runs limit 1),
  jsonb_build_array('FIRST', 'SECOND', 'THIRD'),
  'Run output should contain aggregated map outputs'
);

select * from finish();
rollback;