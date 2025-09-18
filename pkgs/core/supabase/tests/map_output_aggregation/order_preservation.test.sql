begin;
select plan(2);

-- Test: Order preservation in map output aggregation
-- Outputs should be aggregated in task_index order, not completion order

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_order', 10, 60, 3);
select pgflow.add_step('test_order', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_order', 'consumer', array['map_step'], null, null, null, null, 'single');

-- Start flow with 5-item array
select is(
  (select count(*) from pgflow.start_flow('test_order', '["a", "b", "c", "d", "e"]'::jsonb)),
  1::bigint,
  'Flow should start successfully'
);

-- Complete tasks in REVERSE order to test ordering
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_tasks pgflow.step_task_record[];
  i int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Read all 5 tasks and store them
  for i in 1..5 loop
    select * into v_task from pgflow_tests.read_and_start('test_order', 1, 1);
    v_tasks := array_append(v_tasks, v_task);
  end loop;

  -- Complete tasks in reverse order (4, 3, 2, 1, 0)
  for i in reverse 5..1 loop
    -- Complete with index as output (0-based)
    perform pgflow.complete_task(
      v_tasks[i].run_id,
      v_tasks[i].step_slug,
      i - 1,  -- task_index is 0-based
      jsonb_build_object('index', i - 1, 'letter', chr(96 + i))  -- {index: 0, letter: 'a'}, etc.
    );
  end loop;

  -- Trigger dependent step
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Get the aggregated input for verification
select is(
  (select input->'map_step' from pgflow_tests.read_and_start('test_order', 1, 1)),
  jsonb_build_array(
    jsonb_build_object('index', 0, 'letter', 'a'),
    jsonb_build_object('index', 1, 'letter', 'b'),
    jsonb_build_object('index', 2, 'letter', 'c'),
    jsonb_build_object('index', 3, 'letter', 'd'),
    jsonb_build_object('index', 4, 'letter', 'e')
  ),
  'Map outputs should be ordered by task_index, not completion order'
);


select * from finish();
rollback;