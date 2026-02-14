begin;
select plan(6);
select pgflow_tests.reset_db();

-- Setup: Create a flow with map step (max_attempts=>0, when_exhausted=>'skip') and 'other' step
select pgflow.create_flow('double_decrement_test');
select pgflow.add_step('double_decrement_test', 'map_a', '{}', max_attempts=>0, step_type=>'map', when_exhausted=>'skip');
select pgflow.add_step('double_decrement_test', 'other', '{}');

-- Start run with 2 items for map_a
select pgflow.start_flow('double_decrement_test', '[1,2]'::jsonb);
select is(count(*), 2::bigint, 'map_a has 2 tasks') from pgflow.step_tasks where step_slug = 'map_a';

-- Create worker
select pgflow_tests.ensure_worker('double_decrement_test', '00000000-0000-0000-0000-000000000001'::uuid, 'handler');

-- Start both map_a tasks
select pgflow.start_tasks(
  'double_decrement_test', 
  (select array_agg(message_id) from pgflow.step_tasks st join pgflow.runs r on st.run_id = r.run_id where r.flow_slug = 'double_decrement_test' and st.step_slug = 'map_a'),
  '00000000-0000-0000-0000-000000000001'::uuid
);
select is(count(*), 2::bigint, 'Both map_a tasks are started') from pgflow.step_tasks st join pgflow.runs r on st.run_id = r.run_id where r.flow_slug = 'double_decrement_test' and st.step_slug = 'map_a' and st.status = 'started';

-- Start 'other' task (to keep run alive)
select pgflow.start_tasks(
  'double_decrement_test', 
  (select array_agg(message_id) from pgflow.step_tasks st join pgflow.runs r on st.run_id = r.run_id where r.flow_slug = 'double_decrement_test' and st.step_slug = 'other'),
  '00000000-0000-0000-0000-000000000001'::uuid
);

-- Capture remaining_steps BEFORE first fail
create temp table baseline as
select remaining_steps, run_id from pgflow.runs where flow_slug = 'double_decrement_test';

-- Fail map_a[0] -> step becomes skipped
select pgflow.fail_task(baseline.run_id, 'map_a', 0, 'First task failed') from baseline;

-- Capture remaining_steps AFTER first skip
create temp table after_first_skip as
select r.remaining_steps, r.run_id from pgflow.runs r, baseline b where r.run_id = b.run_id;

-- Verify step is skipped
select is(
  (select ss.status from pgflow.step_states ss, after_first_skip a where ss.run_id = a.run_id and ss.step_slug = 'map_a'),
  'skipped',
  'map_a step is skipped after first task failure'
);

-- Verify remaining_steps decreased
select ok(
  (select a.remaining_steps < b.remaining_steps from after_first_skip a, baseline b where a.run_id = b.run_id),
  'remaining_steps decremented after first skip'
);

-- Late-fail map_a[1] (after step is already skipped)
select lives_ok(
  $$
  select pgflow.fail_task(a.run_id, 'map_a', 1, 'Late failure') from after_first_skip a
  $$,
  'Late fail on skipped step does not error'
);

-- Verify remaining_steps is UNCHANGED (no double-decrement)
select is(
  (select r.remaining_steps from pgflow.runs r, after_first_skip a where r.run_id = a.run_id),
  (select remaining_steps from after_first_skip),
  'remaining_steps unchanged after late fail (no double-decrement)'
);

select finish();
rollback;
