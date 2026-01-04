begin;
select plan(3);
select pgflow_tests.reset_db();

-- Test: Verify broadcast event output matches step_states.output
-- This tests that the broadcast uses the stored output column, not task output

-- Setup: Create a flow with a map step
select pgflow.create_flow('test_broadcast_output');
select pgflow.add_step('test_broadcast_output', 'map_step', '{}', null, null, null, null, 'map');

-- Start the flow with a 3-element array
select pgflow.start_flow('test_broadcast_output', '[10, 20, 30]'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('test_broadcast_output');

-- Complete all map tasks
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete task 0
  select * into v_task from pgflow_tests.read_and_start('test_broadcast_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('result', 'A')
  );

  -- Complete task 1
  select * into v_task from pgflow_tests.read_and_start('test_broadcast_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('result', 'B')
  );

  -- Complete task 2 (final task - triggers step completion and broadcast)
  select * into v_task from pgflow_tests.read_and_start('test_broadcast_output', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('result', 'C')
  );
end $$;

-- Test 1: Verify step_states.output has the aggregated array
select is(
  (select output from pgflow.step_states where step_slug = 'map_step'),
  jsonb_build_array(
    jsonb_build_object('result', 'A'),
    jsonb_build_object('result', 'B'),
    jsonb_build_object('result', 'C')
  ),
  'step_states.output should have aggregated array'
);

-- Test 2: Get broadcast event output
select is(
  (select payload->'output' from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'step_slug' = 'map_step'
   limit 1),
  jsonb_build_array(
    jsonb_build_object('result', 'A'),
    jsonb_build_object('result', 'B'),
    jsonb_build_object('result', 'C')
  ),
  'Broadcast event output should match stored output'
);

-- Test 3: Explicitly verify broadcast output equals step_states.output
select is(
  (select payload->'output' from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'step_slug' = 'map_step'
   limit 1),
  (select output from pgflow.step_states where step_slug = 'map_step'),
  'Broadcast output must equal step_states.output (uses stored value)'
);

select * from finish();
rollback;
