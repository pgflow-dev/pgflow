begin;
select plan(4);

select pgflow_tests.reset_db();

select pgflow.create_flow('dependent_fail_archive');
select pgflow.add_step(
  flow_slug => 'dependent_fail_archive',
  step_slug => 'first'
);
select pgflow.add_step(
  flow_slug => 'dependent_fail_archive',
  step_slug => 'second'
);
select pgflow.add_step(
  flow_slug => 'dependent_fail_archive',
  step_slug => 'checker',
  deps_slugs => array['first'],
  required_input_pattern => '{"ok": true}'::jsonb,
  when_unmet => 'fail'
);

with run as (
  select *
  from pgflow.start_flow('dependent_fail_archive', '{}'::jsonb)
)
select run_id into temporary run_ids from run;

with started as (
  select * from pgflow_tests.read_and_start('dependent_fail_archive', qty => 10)
),
target as (
  select run_id, step_slug, task_index
  from started
  where step_slug = 'first'
  limit 1
)
select pgflow.complete_task(
  (select run_id from target),
  (select step_slug from target),
  (select task_index from target),
  '{"ok": false}'::jsonb
);

select is(
  (
    select status
    from pgflow.runs
    where run_id = (select run_id from run_ids)
  ),
  'failed',
  'run should fail when dependent fail-condition is unmet'
);

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'checker'
  ),
  'failed',
  'checker should fail due to unmet condition'
);

select is(
  (
    select count(*)
    from pgmq.q_dependent_fail_archive
  ),
  0::bigint,
  'run failure should archive all active queue messages'
);

select ok(
  (
    select count(*)
    from pgmq.a_dependent_fail_archive
  ) >= 2,
  'archive queue should contain completed and run-failure archived messages'
);

drop table if exists run_ids;

select finish();
rollback;
