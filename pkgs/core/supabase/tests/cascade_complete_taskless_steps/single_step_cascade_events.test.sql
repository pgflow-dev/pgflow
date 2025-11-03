begin;
select plan(4);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and create flow: A -> B -> C (all single steps)
select pgflow_tests.reset_db();
select pgflow.create_flow('single_cascade');
select pgflow.add_step('single_cascade', 'step_a');
select pgflow.add_step('single_cascade', 'step_b', deps_slugs => ARRAY['step_a']);
select pgflow.add_step('single_cascade', 'step_c', deps_slugs => ARRAY['step_b']);

-- Start flow
with flow as (
  select * from pgflow.start_flow('single_cascade', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Start and complete step_a task
select pgflow_tests.read_and_start('single_cascade', 1, 1);
select pgflow.complete_task(
  (select run_id from run_ids),
  'step_a',
  0,
  '{"result": "a"}'::jsonb
);

-- Start and complete step_b task
select pgflow_tests.read_and_start('single_cascade', 1, 1);
select pgflow.complete_task(
  (select run_id from run_ids),
  'step_b',
  0,
  '{"result": "b"}'::jsonb
);

-- Start and complete step_c task
select pgflow_tests.read_and_start('single_cascade', 1, 1);
select pgflow.complete_task(
  (select run_id from run_ids),
  'step_c',
  0,
  '{"result": "c"}'::jsonb
);

-- Test 1: Verify step_a event broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'step_a'),
  1::int,
  'Step A should broadcast step:completed event (from complete_task)'
);

-- Test 2: Verify step_b event broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'step_b'),
  1::int,
  'Step B should broadcast step:completed event (from complete_task)'
);

-- Test 3: Verify step_c event broadcast
select is(
  pgflow_tests.count_realtime_events('step:completed', (select run_id from run_ids), 'step_c'),
  1::int,
  'Step C should broadcast step:completed event (from complete_task)'
);

-- Test 4: Verify all three events broadcast in correct order
select results_eq(
  $$ SELECT payload->>'step_slug'
     FROM realtime.messages
     WHERE payload->>'event_type' = 'step:completed'
       AND payload->>'run_id' = (SELECT run_id::text FROM run_ids)
     ORDER BY id $$,
  $$ VALUES ('step_a'), ('step_b'), ('step_c') $$,
  'Events should be broadcast in completion order: step_a, step_b, step_c'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
