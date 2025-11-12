begin;
select plan(5);

-- Reset database and create flow:
-- parent_step (single) -> taskless_child1 (map) -> taskless_child2 (map)
-- Parent outputs empty array, triggering cascade completion of map children
select pgflow_tests.reset_db();
select pgflow.create_flow('order_test');
select pgflow.add_step('order_test', 'parent_step', step_type => 'single');
select pgflow.add_step('order_test', 'taskless_child1', deps_slugs => ARRAY['parent_step'], step_type => 'map');
select pgflow.add_step('order_test', 'taskless_child2', deps_slugs => ARRAY['taskless_child1'], step_type => 'map');

-- Start flow
with flow as (
  select * from pgflow.start_flow('order_test', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Start and complete parent_step task with EMPTY ARRAY output
-- This will trigger cascade completion of both taskless map children
select pgflow_tests.read_and_start('order_test', 1, 1);
select pgflow.complete_task(
  (select run_id from run_ids),
  'parent_step',
  0,
  '[]'::jsonb  -- Empty array triggers cascade of dependent maps
);

-- Test 1: All three step:completed events should be broadcast
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  3::bigint,
  'Should broadcast 3 step:completed events (parent + 2 cascade children)'
);

-- Test 2: Verify parent_step broadcast exists
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'parent_step'),
  1::int,
  'Parent step should broadcast step:completed'
);

-- Test 3: Verify taskless_child1 broadcast exists
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_child1'),
  1::int,
  'Taskless child 1 should broadcast step:completed'
);

-- Test 4: Verify taskless_child2 broadcast exists
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'taskless_child2'),
  1::int,
  'Taskless child 2 should broadcast step:completed'
);

-- Test 5: CRITICAL - Verify broadcast order respects dependency graph
-- Parent MUST broadcast BEFORE its dependent children
-- Use inserted_at timestamp for ordering (UUIDs don't have order)
with ordered_events as (
  select
    inserted_at,
    payload->>'step_slug' as step_slug,
    row_number() over (order by inserted_at) as event_order
  from realtime.messages
  where payload->>'event_type' = 'step:completed'
    and payload->>'run_id' = (select run_id::text from run_ids)
),
parent_event as (
  select event_order as parent_order
  from ordered_events
  where step_slug = 'parent_step'
),
child1_event as (
  select event_order as child1_order
  from ordered_events
  where step_slug = 'taskless_child1'
),
child2_event as (
  select event_order as child2_order
  from ordered_events
  where step_slug = 'taskless_child2'
)
select ok(
  (select parent_order from parent_event) < (select child1_order from child1_event)
  AND (select child1_order from child1_event) < (select child2_order from child2_event),
  'CRITICAL: Events must arrive in dependency order (parent -> child1 -> child2)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
