-- Test: _cascade_force_skip_steps - Broadcast order respects dependency graph
-- Verifies step:skipped events are sent in topological order
begin;
select plan(2);

-- Reset database and create a chain: A -> B -> C
select pgflow_tests.reset_db();
select pgflow.create_flow('order_test');
select pgflow.add_step('order_test', 'step_a');
select pgflow.add_step('order_test', 'step_b', ARRAY['step_a']);
select pgflow.add_step('order_test', 'step_c', ARRAY['step_b']);

-- Start flow
with flow as (
  select * from pgflow.start_flow('order_test', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Skip step_a (cascades to B and C)
select pgflow._cascade_force_skip_steps(
  (select run_id from run_ids),
  'step_a',
  'condition_unmet'
);

-- Test 1: All 3 step:skipped events should exist
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:skipped'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  3::bigint,
  'Should have 3 step:skipped events'
);

-- Test 2: Events should be in dependency order (A before B before C)
with ordered_events as (
  select
    inserted_at,
    payload->>'step_slug' as step_slug,
    row_number() over (order by inserted_at) as event_order
  from realtime.messages
  where payload->>'event_type' = 'step:skipped'
    and payload->>'run_id' = (select run_id::text from run_ids)
),
step_a_event as (
  select event_order from ordered_events where step_slug = 'step_a'
),
step_b_event as (
  select event_order from ordered_events where step_slug = 'step_b'
),
step_c_event as (
  select event_order from ordered_events where step_slug = 'step_c'
)
select ok(
  (select event_order from step_a_event) < (select event_order from step_b_event)
  AND (select event_order from step_b_event) < (select event_order from step_c_event),
  'Events must be in dependency order (A -> B -> C)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
