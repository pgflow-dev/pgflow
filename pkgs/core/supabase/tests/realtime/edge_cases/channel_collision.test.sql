begin;
select plan(4);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create test flow
select pgflow_tests.reset_db();
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step1');

-- Start two flows with the same custom channel
with flow1 as (
  select run_id as run_id_1 from pgflow.start_flow('test_flow', '{"run": 1}'::jsonb, realtime := 'shared-channel')
),
flow2 as (
  select run_id as run_id_2 from pgflow.start_flow('test_flow', '{"run": 2}'::jsonb, realtime := 'shared-channel')
)
select flow1.run_id_1, flow2.run_id_2 
into temporary flow_runs 
from flow1, flow2;

-- Test 1: Both runs should send events to the same shared channel
select is(
  (select count(*) from realtime.messages where topic = 'shared-channel'),
  2::bigint,
  'Both flows should send run:started events to shared-channel'
);

-- Test 2: First run events should be on shared channel
select is(
  (select topic from pgflow_tests.get_realtime_message('run:started', (select run_id_1 from flow_runs))),
  'shared-channel',
  'First run should use shared-channel as topic'
);

-- Test 3: Second run events should be on shared channel  
select is(
  (select topic from pgflow_tests.get_realtime_message('run:started', (select run_id_2 from flow_runs))),
  'shared-channel',
  'Second run should use shared-channel as topic'
);

-- Test 4: Events should contain different run_ids
select isnt(
  (select payload->>'run_id' from pgflow_tests.get_realtime_message('run:started', (select run_id_1 from flow_runs))),
  (select payload->>'run_id' from pgflow_tests.get_realtime_message('run:started', (select run_id_2 from flow_runs))),
  'Events should contain different run_ids despite sharing channel'
);

-- Clean up
drop table if exists flow_runs;

select finish();
rollback;