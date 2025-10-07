begin;
select plan(2);

-- Test: Map tasks returning NULL outputs
-- NULL values should be preserved in aggregated array

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_nulls', 10, 60, 3);
select pgflow.add_step('test_nulls', 'map_with_nulls', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_nulls', 'consumer', array['map_with_nulls'], null, null, null, null, 'single');

-- Start flow with 5-item array
select is(
  (select count(*) from pgflow.start_flow('test_nulls', '[1, 2, 3, 4, 5]'::jsonb)),
  1::bigint,
  'Flow should start with 5-element array'
);

-- Complete map tasks with mix of nulls and values
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
  -- Define outputs: some null, some values
  v_outputs jsonb[] := array[
    '42'::jsonb,           -- task 0: number
    'null'::jsonb,         -- task 1: NULL
    '"text"'::jsonb,       -- task 2: string
    'null'::jsonb,         -- task 3: NULL
    'true'::jsonb          -- task 4: boolean
  ];
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete all 5 tasks
  for i in 1..5 loop
    select * into v_task from pgflow_tests.read_and_start('test_nulls', 1, 1);

    -- Get task_index
    select task_index into v_task_index
    from pgflow.step_tasks
    where run_id = v_task.run_id
      and step_slug = v_task.step_slug
      and message_id = v_task.msg_id;

    -- Complete with predefined output (including nulls)
    perform pgflow.complete_task(
      v_task.run_id,
      v_task.step_slug,
      v_task_index,
      v_outputs[v_task_index + 1]  -- +1 for 1-indexed array
    );
  end loop;

  -- Trigger dependent step
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify consumer receives array with nulls preserved
select is(
  (select input->'map_with_nulls' from pgflow_tests.read_and_start('test_nulls', 1, 1)),
  jsonb_build_array(42, null, 'text', null, true),
  'Aggregated array should preserve NULL values in correct positions'
);

select * from finish();
rollback;