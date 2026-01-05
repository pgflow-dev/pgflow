-- Test: cascade_skip_steps - step:skipped event payload format
-- Verifies the realtime event contains all required fields
begin;
select plan(8);

-- Reset database and create a simple flow
select pgflow_tests.reset_db();
select pgflow.create_flow('event_test');
select pgflow.add_step('event_test', 'step_a');

-- Start flow
with flow as (
  select * from pgflow.start_flow('event_test', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Skip step_a
select pgflow.cascade_skip_steps(
  (select run_id from run_ids),
  'step_a',
  'condition_unmet'
);

-- Get the event for assertions
select * into temporary skip_event
from pgflow_tests.get_realtime_message('step:skipped', (select run_id from run_ids), 'step_a');

-- Test 1: Event type should be step:skipped
select is(
  (select payload->>'event_type' from skip_event),
  'step:skipped',
  'Event type should be step:skipped'
);

-- Test 2: step_slug should be in payload
select is(
  (select payload->>'step_slug' from skip_event),
  'step_a',
  'Payload should contain step_slug'
);

-- Test 3: flow_slug should be in payload
select is(
  (select payload->>'flow_slug' from skip_event),
  'event_test',
  'Payload should contain flow_slug'
);

-- Test 4: run_id should be in payload
select is(
  (select payload->>'run_id' from skip_event),
  (select run_id::text from run_ids),
  'Payload should contain run_id'
);

-- Test 5: status should be skipped
select is(
  (select payload->>'status' from skip_event),
  'skipped',
  'Payload status should be skipped'
);

-- Test 6: skip_reason should be in payload
select is(
  (select payload->>'skip_reason' from skip_event),
  'condition_unmet',
  'Payload should contain skip_reason'
);

-- Test 7: skipped_at timestamp should be present
select ok(
  (select (payload->>'skipped_at')::timestamptz is not null from skip_event),
  'Payload should include skipped_at timestamp'
);

-- Test 8: Event name format should be step:<slug>:skipped
select is(
  (select event from skip_event),
  'step:step_a:skipped',
  'Event name should be step:<slug>:skipped'
);

-- Clean up
drop table if exists run_ids;
drop table if exists skip_event;

select finish();
rollback;
