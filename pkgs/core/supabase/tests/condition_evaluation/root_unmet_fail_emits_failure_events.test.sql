begin;
select plan(6);

select pgflow_tests.reset_db();

select pgflow.create_flow('root_fail_events');
select pgflow.add_step(
  flow_slug => 'root_fail_events',
  step_slug => 'guarded',
  required_input_pattern => '{"ok": true}'::jsonb,
  when_unmet => 'fail'
);

with run as (
  select *
  from pgflow.start_flow('root_fail_events', '{}'::jsonb)
)
select run_id into temporary run_ids from run;

select is(
  (
    select status
    from pgflow.step_states
    where run_id = (select run_id from run_ids)
      and step_slug = 'guarded'
  ),
  'failed',
  'guarded step should fail when root condition is unmet'
);

select is(
  (
    select status
    from pgflow.runs
    where run_id = (select run_id from run_ids)
  ),
  'failed',
  'run should fail when root fail-condition is unmet'
);

select is(
  pgflow_tests.count_realtime_events(
    event_type => 'step:failed',
    run_id => (select run_id from run_ids),
    step_slug => 'guarded'
  ),
  1::integer,
  'should emit one step:failed event'
);

select is(
  pgflow_tests.count_realtime_events(
    event_type => 'run:failed',
    run_id => (select run_id from run_ids)
  ),
  1::integer,
  'should emit one run:failed event'
);

select is(
  (
    select payload->>'status'
    from pgflow_tests.get_realtime_message(
      event_type => 'step:failed',
      run_id => (select run_id from run_ids),
      step_slug => 'guarded'
    )
  ),
  'failed',
  'step:failed payload should include failed status'
);

select is(
  (
    select payload->>'status'
    from pgflow_tests.get_realtime_message(
      event_type => 'run:failed',
      run_id => (select run_id from run_ids)
    )
  ),
  'failed',
  'run:failed payload should include failed status'
);

drop table if exists run_ids;

select finish();
rollback;
