begin;
select plan(7);
select pgflow_tests.reset_db();

-- Test: Map step sends N messages to queue with correct task_index
select diag('Testing map step sends multiple queue messages');

-- Create a flow with a map step
select pgflow.create_flow('test_map_queue');
select pgflow.add_step(
  flow_slug => 'test_map_queue',
  step_slug => 'map_step',
  step_type => 'map'
);

-- Start a flow with an array input of 3 items
insert into pgflow.runs (flow_slug, status, input)
values ('test_map_queue', 'started', '["a", "b", "c"]'::jsonb)
returning run_id as test_run_id \gset

-- Initialize step state
insert into pgflow.step_states (flow_slug, run_id, step_slug, initial_tasks, remaining_deps)
values ('test_map_queue', :'test_run_id', 'map_step', 3, 0);

-- Call start_ready_steps
select pgflow.start_ready_steps(:'test_run_id');

-- Check messages in the queue
with messages as (
  select msg_id, message from pgmq.q_test_map_queue
  order by msg_id
)
select is(
  (select count(*) from messages),
  3::bigint,
  'Should send 3 messages to queue for map step with 3 tasks'
);

-- Verify each message has correct task_index
with messages as (
  select msg_id, message from pgmq.q_test_map_queue
  order by msg_id
)
select set_eq(
  $$select (message->>'task_index')::int from pgmq.q_test_map_queue order by msg_id$$,
  ARRAY[0, 1, 2],
  'Messages should have task_index values 0, 1, 2'
);

-- Verify message structure for first task
select is(
  (select message->>'flow_slug' from pgmq.q_test_map_queue 
   where (message->>'task_index')::int = 0 limit 1),
  'test_map_queue',
  'Message should contain correct flow_slug'
);

select is(
  (select message->>'run_id' from pgmq.q_test_map_queue 
   where (message->>'task_index')::int = 0 limit 1),
  :'test_run_id'::text,
  'Message should contain correct run_id'
);

select is(
  (select message->>'step_slug' from pgmq.q_test_map_queue 
   where (message->>'task_index')::int = 0 limit 1),
  'map_step',
  'Message should contain correct step_slug'
);

-- Test: Map step with start_delay applies to all messages
select diag('Testing map step with start_delay');

-- Create flow with delayed map step
select pgflow.create_flow('test_delayed_map');
select pgflow.add_step(
  flow_slug => 'test_delayed_map',
  step_slug => 'delayed_map',
  step_type => 'map',
  start_delay => 5  -- 5 second delay
);

-- Start flow
insert into pgflow.runs (flow_slug, status, input)
values ('test_delayed_map', 'started', '[1, 2]'::jsonb)
returning run_id as delayed_run_id \gset

-- Initialize step state
insert into pgflow.step_states (flow_slug, run_id, step_slug, initial_tasks, remaining_deps)
values ('test_delayed_map', :'delayed_run_id', 'delayed_map', 2, 0);

-- Call start_ready_steps
select pgflow.start_ready_steps(:'delayed_run_id');

-- Verify messages are scheduled with delay
select is(
  (select count(*) from pgmq.q_test_delayed_map where vt > now()),
  2::bigint,
  'All messages should be scheduled with a delay'
);

-- Verify 2 messages were sent
select is(
  (select count(*) from pgmq.q_test_delayed_map),
  2::bigint,
  'Should send 2 messages for map step with 2 tasks'
);

select * from finish();
rollback;