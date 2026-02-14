\set ON_ERROR_STOP on
\set QUIET on

begin;
select plan(5);

select pgflow_tests.reset_db();

select pgflow.create_flow('cascade_skip_archive');
select pgflow.add_step('cascade_skip_archive', 'map_a', '{}', max_attempts=>0, step_type=>'map', when_exhausted=>'skip');
select pgflow.add_step('cascade_skip_archive', 'other', '{}');

select pgflow.start_flow('cascade_skip_archive', '[1, 2, 3]'::jsonb);

with tasks as (
  select message_id, task_index
  from pgflow.step_tasks
  where flow_slug = 'cascade_skip_archive' and step_slug = 'map_a'
  order by task_index
)
select pgflow.start_tasks('cascade_skip_archive', array[(select message_id from tasks where task_index = 0)::bigint], pgflow_tests.ensure_worker('cascade_skip_archive'));

select ok(
  (select count(*) = 3 from pgflow.step_tasks 
   where flow_slug = 'cascade_skip_archive' and step_slug = 'map_a'),
  'Setup: map_a should have 3 tasks'
);

select ok(
  (select count(*) >= 1 from pgmq.q_cascade_skip_archive),
  'Setup: queue should have messages'
);

select pgflow._cascade_force_skip_steps(
  (select run_id from pgflow.runs where flow_slug = 'cascade_skip_archive'),
  'map_a',
  'condition_unmet'
);

select is(
  (select status from pgflow.step_states where flow_slug = 'cascade_skip_archive' and step_slug = 'map_a'),
  'skipped'::text,
  'Step state should be skipped'
);

select is_empty(
  $$
  select 1
  from pgmq.q_cascade_skip_archive q
  join pgflow.step_tasks st on st.message_id = q.msg_id
  where st.flow_slug = 'cascade_skip_archive'
    and st.step_slug = 'map_a'
  $$,
  'Queue should have 0 messages for skipped map_a step after _cascade_force_skip_steps'
);

select ok(
  (select count(*) >= 3 from pgmq.a_cascade_skip_archive a
   join pgflow.step_tasks st on st.message_id = a.msg_id
   where st.flow_slug = 'cascade_skip_archive' and st.step_slug = 'map_a'),
  'Archive should contain all 3 map_a task messages'
);

select * from finish();
rollback;
