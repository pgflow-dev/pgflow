\set ON_ERROR_STOP on
\set QUIET on

begin;
select plan(5);

select pgflow_tests.reset_db();

select pgflow.create_flow('idempotent_test');
select pgflow.add_step('idempotent_test', 'map_step', '{}', max_attempts => 0, step_type => 'map', when_exhausted => 'skip');
select pgflow.add_step('idempotent_test', 'dependent_step', ARRAY['map_step']);

select pgflow.start_flow('idempotent_test', '[1, 2, 3]'::jsonb);

with tasks as (
  select message_id, task_index
  from pgflow.step_tasks
  where flow_slug = 'idempotent_test' and step_slug = 'map_step'
  order by task_index
)
select pgflow.start_tasks('idempotent_test', array[(select message_id from tasks where task_index = 0)::bigint], pgflow_tests.ensure_worker('idempotent_test'));

create temporary table test_run as
select run_id from pgflow.runs where flow_slug = 'idempotent_test';

select is(
  (select pgflow._cascade_force_skip_steps(
    (select run_id from test_run),
    'map_step',
    'condition_unmet'
  )),
  2::int,
  'First call should skip 2 steps (map_step + dependent_step)'
);

create temporary table after_first as
select
  (select remaining_steps from pgflow.runs where run_id = (select run_id from test_run)) as remaining_steps,
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:skipped'
     and (payload->>'run_id')::uuid = (select run_id from test_run)) as event_count,
  (select count(*) from pgmq.a_idempotent_test) as archive_count;

select is(
  (select pgflow._cascade_force_skip_steps(
    (select run_id from test_run),
    'map_step',
    'condition_unmet'
  )),
  0::int,
  'Second call should return 0 (no new skips)'
);

select is(
  (select remaining_steps from pgflow.runs where run_id = (select run_id from test_run)),
  (select remaining_steps from after_first),
  'remaining_steps should be unchanged after second call'
);

select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:skipped'
     and (payload->>'run_id')::uuid = (select run_id from test_run)),
  (select event_count from after_first),
  'step:skipped event count should be unchanged after second call'
);

select is(
  (select count(*) from pgmq.a_idempotent_test),
  (select archive_count from after_first),
  'Archive count should be unchanged after second call'
);

select * from finish();
rollback;
