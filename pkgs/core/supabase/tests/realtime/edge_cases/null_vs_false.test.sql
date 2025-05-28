begin;
select plan(4);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create test flow
select pgflow_tests.reset_db();
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step1');

-- Test 1: realtime => NULL should disable realtime
with flow as (
  select run_id from pgflow.start_flow('test_flow', '{}'::jsonb, realtime := NULL)
)
select run_id into temporary null_run from flow;

select is(
  pgflow_tests.count_realtime_events('run:started', (select run_id from null_run)),
  0::int,
  'Flow with realtime := NULL should send no events'
);

-- Test 2: realtime => 'false' should disable realtime  
with flow as (
  select run_id from pgflow.start_flow('test_flow', '{}'::jsonb, realtime := 'false')
)
select run_id into temporary false_run from flow;

select is(
  pgflow_tests.count_realtime_events('run:started', (select run_id from false_run)),
  0::int,
  'Flow with realtime := ''false'' should send no events'
);

-- Test 3: Verify NULL sets realtime_channel to NULL
select is(
  (select realtime_channel from pgflow.runs where run_id = (select run_id from null_run)),
  NULL,
  'Flow with realtime := NULL should have realtime_channel = NULL'
);

-- Test 4: Verify 'false' sets realtime_channel to NULL
select is(
  (select realtime_channel from pgflow.runs where run_id = (select run_id from false_run)),
  NULL,
  'Flow with realtime := ''false'' should have realtime_channel = NULL'
);

-- Clean up
drop table if exists null_run;
drop table if exists false_run;

select finish();
rollback;