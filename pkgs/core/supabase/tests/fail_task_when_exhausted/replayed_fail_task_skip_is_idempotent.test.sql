begin;
select plan(7);

select pgflow_tests.reset_db();

select pgflow.create_flow('replayed_skip_idempotent');
select pgflow.add_step(
  flow_slug => 'replayed_skip_idempotent',
  step_slug => 'a',
  max_attempts => 0,
  when_exhausted => 'skip'
);
select pgflow.add_step(
  flow_slug => 'replayed_skip_idempotent',
  step_slug => 'd'
);
select pgflow.add_step(
  flow_slug => 'replayed_skip_idempotent',
  step_slug => 'c',
  deps_slugs => array['d']
);
select pgflow.add_step(
  flow_slug => 'replayed_skip_idempotent',
  step_slug => 'b',
  deps_slugs => array['a', 'c']
);

with run as (
  select *
  from pgflow.start_flow('replayed_skip_idempotent', '{}'::jsonb)
)
select run_id into temporary run_ids from run;

with started as (
  select * from pgflow_tests.read_and_start('replayed_skip_idempotent', qty => 10)
),
target as (
  select run_id, step_slug, task_index
  from started
  where step_slug = 'a'
  limit 1
)
select pgflow.fail_task(
  (select run_id from target),
  (select step_slug from target),
  (select task_index from target),
  (select step_slug from target) || ' FAILED'
);

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'a'
  ),
  'skipped',
  'first fail should skip step a'
);

select is(
  (
    select remaining_deps
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'b'
  ),
  1,
  'first fail should decrement b remaining deps from 2 to 1'
);

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'b'
  ),
  'created',
  'b should still be waiting on c after first fail'
);

select pgflow.fail_task(
  run_id => (select run_id from run_ids),
  step_slug => 'a',
  task_index => 0,
  error_message => 'replayed failure'
);

select is(
  (
    select remaining_deps
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'b'
  ),
  1,
  'replayed fail_task should not decrement b remaining deps again'
);

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'b'
  ),
  'created',
  'replayed fail_task should not start b prematurely'
);

select is(
  pgflow_tests.count_realtime_events(
    event_type => 'step:skipped',
    run_id => (select run_id from run_ids),
    step_slug => 'a'
  ),
  1::integer,
  'replayed fail_task should not emit duplicate step:skipped event'
);

select is(
  (
    select status
    from pgflow.runs
    where run_id = (select run_id from run_ids)
  ),
  'started',
  'run should remain started while c is incomplete'
);

drop table if exists run_ids;

select finish();
rollback;
