begin;
select plan(2);

-- Test: Map to single step with various data types
-- Single step should receive full aggregated array with mixed types

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_m2s', 10, 60, 3);
select pgflow.add_step('test_m2s', 'map_src', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_m2s', 'single_dst', array['map_src'], null, null, null, null, 'single');

-- Start flow with mixed type array
select is(
  (select count(*) from pgflow.start_flow('test_m2s',
    '[100, "text", true, null, {"nested": "object"}, [1,2,3]]'::jsonb)),
  1::bigint,
  'Flow should start with mixed type array'
);

-- Complete map tasks with different output types
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_outputs jsonb[] := array[
    '42'::jsonb,                           -- number
    '"string output"'::jsonb,              -- string
    'false'::jsonb,                        -- boolean
    'null'::jsonb,                         -- null
    '{"key": "value", "num": 123}'::jsonb, -- object
    '[10, 20, 30]'::jsonb                  -- array
  ];
  i int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete all 6 map tasks
  for i in 1..6 loop
    select * into v_task from pgflow_tests.read_and_start('test_m2s', 1, 1);
    perform pgflow.complete_task(v_task.run_id, v_task.step_slug, i - 1, v_outputs[i]);
  end loop;

  -- Trigger dependent step
  perform pgflow.start_ready_steps(v_run_id);
end $$;

-- Verify single step receives properly aggregated array
select is(
  (select input->'map_src' from pgflow_tests.read_and_start('test_m2s', 1, 1)),
  jsonb_build_array(
    42,
    'string output',
    false,
    null,
    jsonb_build_object('key', 'value', 'num', 123),
    jsonb_build_array(10, 20, 30)
  ),
  'Single step should receive all outputs aggregated in order'
);

select * from finish();
rollback;