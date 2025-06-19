begin;
select plan(3);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and setup a flow with max_attempts = 1 to fail immediately
select pgflow_tests.reset_db();
select pgflow.create_flow('test-flow', max_attempts => 1);
select pgflow.add_step('test-flow', 'failing-step');

-- Start the flow
with flow as (
  select * from pgflow.start_flow('test-flow', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Manually create a started task (simulating worker started processing)
insert into pgflow.step_tasks (run_id, step_slug, task_index, status, message_id, attempts_count)
select run_id, 'failing-step', 0, 'started', 12345, 1
from run_ids;

-- Update step state to started
update pgflow.step_states
set status = 'started', started_at = now()
where run_id = (select run_id from run_ids)
  and step_slug = 'failing-step';

-- Call fail_task to fail the step permanently
select pgflow.fail_task(
  (select run_id from run_ids),
  'failing-step',
  0,
  'Test failure to check step:failed event'
);

-- Wait a bit for async processing
select pg_sleep(0.1);

-- Test 1: Verify step state is failed in database
select is(
  (select status from pgflow.step_states 
   where run_id = (select run_id from run_ids) 
   and step_slug = 'failing-step'),
  'failed',
  'Step state should be marked as failed in the database'
);

-- Test 2: Verify run:failed event was sent
select is(
  pgflow_tests.count_realtime_events('run:failed', (select run_id from run_ids)),
  1::int,
  'run:failed event should be broadcast'
);

-- Test 3: Verify step:failed event was sent (THIS IS THE BUG - IT MIGHT FAIL!)
select is(
  pgflow_tests.count_realtime_events('step:failed', (select run_id from run_ids), 'failing-step'),
  1::int,
  'step:failed event should be broadcast when step fails permanently'
);

-- Additional debugging: show what events were actually sent
select diag('Events in realtime.messages:');
select diag(concat('  ', mt.event, ': ', mt.payload::text))
from realtime.messages m
cross join lateral (
  select 
    m.payload->>'event_type' as event,
    m.payload
) mt
where m.topic = concat('pgflow:run:', (select run_id from run_ids))
order by m.inserted_at;

-- Clean up
drop table if exists run_ids;

select finish();
rollback;