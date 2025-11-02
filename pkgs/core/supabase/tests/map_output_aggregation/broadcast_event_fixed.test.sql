begin;
select plan(4);


-- Test: Map step completion broadcast contains aggregated array
-- This test verifies the broadcast fix is working correctly

-- Setup
select pgflow_tests.reset_db();
select pgflow.create_flow('test_broadcast_fix', 10, 60, 3);
select pgflow.add_step('test_broadcast_fix', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_broadcast_fix', 'consumer', array['map_step'], null, null, null, null, 'single');

-- Start flow with 3-element array
select is(
  (select count(*) from pgflow.start_flow('test_broadcast_fix', '[100, 200, 300]'::jsonb)),
  1::bigint,
  'Flow should start with 3-element array'
);

-- Complete all map tasks with distinct outputs
do $$
declare
  v_run_id uuid;
  v_task pgflow.step_task_record;
  v_task_index int;
begin
  select run_id into v_run_id from pgflow.runs limit 1;

  -- Complete task 0
  select * into v_task from pgflow_tests.read_and_start('test_broadcast_fix', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('value', 'first_result')
  );

  -- Complete task 1
  select * into v_task from pgflow_tests.read_and_start('test_broadcast_fix', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('value', 'second_result')
  );

  -- Complete task 2 (final task - triggers step completion)
  select * into v_task from pgflow_tests.read_and_start('test_broadcast_fix', 1, 1);
  select task_index into v_task_index
  from pgflow.step_tasks
  where run_id = v_task.run_id
    and step_slug = v_task.step_slug
    and message_id = v_task.msg_id;
  perform pgflow.complete_task(
    v_task.run_id,
    v_task.step_slug,
    v_task_index,
    jsonb_build_object('value', 'third_result')
  );
end $$;

-- Verify step:completed event was sent
select is(
  pgflow_tests.count_realtime_events('step:completed',
    (select run_id from pgflow.runs limit 1),
    'map_step'),
  1,
  'Should have exactly one step:completed broadcast for map_step'
);

-- CRITICAL TEST: Broadcast should contain AGGREGATED array, not last task output
select is(
  (select payload->'output' from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'step_slug' = 'map_step'
   limit 1),
  jsonb_build_array(
    jsonb_build_object('value', 'first_result'),
    jsonb_build_object('value', 'second_result'),
    jsonb_build_object('value', 'third_result')
  ),
  'Broadcast output should be aggregated array of all task outputs'
);

-- Also verify the event contains correct metadata
select is(
  (select
    (payload->>'event_type' = 'step:completed') and
    (payload->>'step_slug' = 'map_step') and
    (payload->>'status' = 'completed') and
    (payload->'completed_at' is not null)
   from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'step_slug' = 'map_step'
   limit 1),
  true,
  'Broadcast should contain correct metadata'
);

select * from finish();
rollback;