begin;
select plan(11);

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

-- Capture active message IDs before failure
create temporary table pre_failure_msgs as
select msg_id from pgmq.q_dependent_fail_archive;

select ok(
  (select count(*) > 0 from pre_failure_msgs),
  'should have active messages before failure'
);

-- Install a guard on the queue table: archiving (DELETE) is only allowed once the
-- owning step_tasks row left queued/started. If cascade_resolve_conditions archives
-- messages before terminalizing their tasks, this trigger raises.
create or replace function pg_temp.assert_task_terminalized_before_archive()
returns trigger language plpgsql as $$
declare
  v_flow_slug text := substr(tg_table_name, 3); -- strip 'q_' prefix
  v_status text;
begin
  select st.status into v_status
  from pgflow.step_tasks st
  join pgflow.runs r on r.run_id = st.run_id
  where r.flow_slug = v_flow_slug
    and st.message_id = old.msg_id;

  if v_status in ('queued', 'started') then
    raise exception 'message % archived before its task was terminalized', old.msg_id;
  end if;

  return old;
end;
$$;

create trigger assert_terminalized_before_archive
before delete on pgmq.q_dependent_fail_archive
for each row execute function pg_temp.assert_task_terminalized_before_archive();

-- Start both root tasks ('second' is the independent branch that stays unfinished)
select * from pgflow_tests.read_and_start('dependent_fail_archive', qty => 10);

-- Complete 'first' with an output that leaves the checker condition unmet
select lives_ok(
  $$
    select pgflow.complete_task(
      (select run_id from run_ids),
      'first',
      0,
      '{"ok": false}'::jsonb
    )
  $$,
  'condition failure should archive active messages only after terminalizing their tasks'
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
    select status
    from pgflow.step_tasks
    where run_id = (select run_id from run_ids)
      and step_slug = 'first'
  ),
  'completed',
  'completed trigger task should stay completed'
);

select is(
  (
    select status
    from pgflow.step_tasks
    where run_id = (select run_id from run_ids)
      and step_slug = 'second'
  ),
  'cancelled',
  'independent unfinished task should become cancelled'
);

select is(
  (
    select count(*)::int
    from pgflow.step_tasks
    where run_id = (select run_id from run_ids)
      and status in ('queued', 'started')
  ),
  0,
  'failed run should have zero task rows with status queued or started'
);

select is(
  (
    select count(*)
    from pgmq.q_dependent_fail_archive
  ),
  0::bigint,
  'run failure should archive all active queue messages'
);

-- Verify specific messages were archived
select is(
  (
    select count(*)::int
    from pgmq.a_dependent_fail_archive a
    join pre_failure_msgs p on a.msg_id = p.msg_id
  ),
  (select count(*)::int from pre_failure_msgs),
  'previously active messages should be in archive'
);

-- Replay the failure route: events must not duplicate, terminal state must hold
select is(
  pgflow.cascade_resolve_conditions((select run_id from run_ids)),
  false,
  'replayed cascade_resolve_conditions should return false without duplicating transitions'
);

select is(
  pgflow_tests.count_realtime_events(
    'run:failed',
    (select run_id from run_ids)
  ),
  1::int,
  'replayed failure route should not duplicate run:failed events'
);

drop table if exists run_ids;
drop table if exists pre_failure_msgs;

select finish();
rollback;
