begin;
select plan(6);

-- Reset database and create flow: producer -> map1 -> map2
select pgflow_tests.reset_db();
select pgflow.create_flow('mixed_cascade');
select pgflow.add_step('mixed_cascade', 'producer');
select pgflow.add_step('mixed_cascade', 'map1', deps_slugs => ARRAY['producer'], step_type => 'map');
select pgflow.add_step('mixed_cascade', 'map2', deps_slugs => ARRAY['map1'], step_type => 'map');

-- Start flow
with flow as (
  select * from pgflow.start_flow('mixed_cascade', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Start and complete producer task with empty array output (triggers cascade for map1 and map2)
select pgflow_tests.read_and_start('mixed_cascade', 1, 1);
select pgflow.complete_task(
  (select run_id from run_ids),
  'producer',
  0,
  '[]'::jsonb
);

-- Test 1: Verify all steps completed
select results_eq(
  $$ SELECT step_slug, status FROM pgflow.step_states ORDER BY step_slug $$,
  $$ VALUES ('map1', 'completed'), ('map2', 'completed'), ('producer', 'completed') $$,
  'All three steps should be completed'
);

-- Test 2: Verify initial_tasks counts
select results_eq(
  $$ SELECT step_slug, initial_tasks FROM pgflow.step_states ORDER BY step_slug $$,
  $$ VALUES ('map1', 0), ('map2', 0), ('producer', 1) $$,
  'Maps should have initial_tasks=0, producer should have initial_tasks=1'
);

-- Test 3: Verify producer event broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'producer'),
  1::int,
  'Producer should broadcast step:completed event (from complete_task)'
);

-- Test 4: Verify map1 event broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'map1'),
  1::int,
  'Map1 should broadcast step:completed event (from cascade)'
);

-- Test 5: Verify map2 event broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'map2'),
  1::int,
  'Map2 should broadcast step:completed event (from cascade)'
);

-- Test 6: Verify all events have empty array output
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:completed'
     and payload->'output'::text = '[]'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  3::bigint,
  'All three step:completed events should have empty array output'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
