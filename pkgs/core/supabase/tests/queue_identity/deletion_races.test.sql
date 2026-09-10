-- Deletion lock-order races (#650): deletion versus complete_task, fail_task,
-- recovery, pruning, start_flow, and external queue loss. pg_blocking_pids
-- barriers pin the interleaving; after release every cooperating pair must
-- complete or reject boundedly, with no queue-first/task-later deadlock.
begin;
select plan(18);

create extension if not exists dblink;

select count(pg_terminate_backend(pid)) as terminated_stale_sessions
from pg_stat_activity
where application_name in ('drace_ctrl', 'drace_a', 'drace_b', 'drace_probe')
  and pid <> pg_backend_pid();

select format(
  'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=',
  coalesce(host(inet_server_addr()), '127.0.0.1'),
  inet_server_port(),
  current_database()
) as conn_base \gset

select dblink_connect('ctrl', :'conn_base' || 'drace_ctrl');
select dblink_exec('ctrl', 'set lock_timeout = 20000');
select dblink_connect('probe', :'conn_base' || 'drace_probe');

create function pg_temp.wait_locked(app_name text, deadline_s int default 10)
returns boolean language plpgsql as $fn$
declare
  blocked boolean;
  deadline timestamptz := clock_timestamp() + make_interval(secs => deadline_s);
begin
  perform pg_sleep(0.2);
  loop
    select exists(
      select 1 from dblink('probe', format(
        'select 1 from pg_stat_activity where application_name = %L and wait_event_type = ''Lock''',
        app_name
      )) as t(x int)
    ) into blocked;
    if blocked or clock_timestamp() > deadline then
      return blocked;
    end if;
    perform pg_sleep(0.1);
  end loop;
end;
$fn$;

create function pg_temp.wait_settled(app_a text, app_b text, deadline_s int default 20)
returns void language plpgsql as $fn$
declare
  still_running int;
  deadline timestamptz := clock_timestamp() + make_interval(secs => deadline_s);
begin
  loop
    select count(*) into still_running
    from dblink('probe', format(
      'select pid from pg_stat_activity where application_name in (%L, %L) and state = ''active'' and pid <> pg_backend_pid()',
      app_a, app_b
    )) as t(pid bigint);
    exit when still_running = 0 or clock_timestamp() > deadline;
    perform pg_sleep(0.2);
  end loop;
end;
$fn$;

create function pg_temp.capture_result(conn text)
returns text language plpgsql as $fn$
declare
  v_first text;
  v_count int;
  v_guard int := 0;
begin
  begin
    select r into v_first from dblink_get_result(conn) as t(r text) limit 1;
  exception when others then
    v_first := 'error:' || sqlstate;
  end;
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 5;
    begin
      select count(*) into v_count from dblink_get_result(conn) as t(r text);
    exception when others then
      v_count := 1;
    end;
    exit when v_count = 0;
  end loop;
  return coalesce(v_first, 'ok:empty');
exception when others then
  return 'error:' || sqlstate;
end;
$fn$;

select dblink_connect('a', :'conn_base' || 'drace_a');
select dblink_exec('a', 'set lock_timeout = 20000');
select dblink_connect('b', :'conn_base' || 'drace_b');
select dblink_exec('b', 'set lock_timeout = 20000');

-- ============================================================
-- RACE 1: deletion vs late complete_task on the same run
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('delrace1', max_attempts => 1); perform pgflow.add_step('delrace1', 'first'); perform pgflow.start_flow('delrace1', '{}'); end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.runs where flow_slug = 'delrace1' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.delete_flow_and_data('delrace1')$$);
select ok(pg_temp.wait_locked('drace_a'), 'deletion queues on the run row lock');

select run_id from dblink('ctrl', $$select run_id from pgflow.runs where flow_slug='delrace1'$$) as t(run_id uuid) \gset
select dblink_send_query('b', format($$select pgflow.complete_task(%L, 'first', 0, '"late"'::jsonb)$$, :'run_id'));
select ok(pg_temp.wait_locked('drace_b'), 'late completion queues on the run row lock');

select dblink_exec('ctrl', 'commit');
select pg_temp.wait_settled('drace_a', 'drace_b');

create temporary table race1 as
select pg_temp.capture_result('a') as del_outcome,
       pg_temp.capture_result('b') as cb_outcome;
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'delrace1')
    + (select count(*)::int from pgmq.list_queues() where queue_name = 'delrace1'),
  (select case when (select del_outcome from race1) like 'error:%' then 1 else 0 end),
  'deletion/completion contention: full deletion or full rollback, never a partial drop'
);

-- ============================================================
-- RACE 2: deletion vs fail_task (task-row lock)
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('delrace2', max_attempts => 1); perform pgflow.add_step('delrace2', 'first'); perform pgflow.start_flow('delrace2', '{}'); end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.step_tasks where flow_slug = 'delrace2' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.delete_flow_and_data('delrace2')$$);
select ok(pg_temp.wait_locked('drace_a'), 'deletion queues on the task row lock');

select dblink_send_query('b', $$select pgflow.fail_task((select run_id from pgflow.runs where flow_slug='delrace2'), 'first', 0, 'boom')$$);
select ok(pg_temp.wait_locked('drace_b'), 'fail_task queues behind the same lock');

select dblink_exec('ctrl', 'commit');
select pg_temp.wait_settled('drace_a', 'drace_b');

create temporary table race2 as
select pg_temp.capture_result('a') as del_outcome,
       pg_temp.capture_result('b') as fail_outcome;
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'delrace2')
    + (select count(*)::int from pgmq.list_queues() where queue_name = 'delrace2'),
  (select case when (select del_outcome from race2) like 'error:%' then 1 else 0 end),
  'deletion/failure contention: full deletion or full rollback, no deadlock'
);

-- ============================================================
-- RACE 3: deletion vs recovery (SKIP LOCKED skips the contested task)
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('delrace3', timeout => 1); perform pgflow.add_step('delrace3', 'first'); perform pgflow.start_flow('delrace3', '{}'); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin update pgflow.step_tasks set queued_at = now() - interval '120 seconds', started_at = now() - interval '120 seconds' where flow_slug = 'delrace3'; end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.step_tasks where flow_slug = 'delrace3' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.delete_flow_and_data('delrace3')$$);
select ok(pg_temp.wait_locked('drace_a'), 'deletion queues on the task row lock');

select is(
  (select r::int from dblink('b', 'select pgflow.requeue_stalled_tasks()') as t(r int)),
  0,
  'recovery skips the locked task instead of waiting'
);

select dblink_exec('ctrl', 'commit');
select pg_temp.capture_result('a');
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'delrace3'),
  0,
  'deletion completes after the recovery skip'
);

-- ============================================================
-- RACE 4: deletion vs pruning (run_id-ordered locks, no deadlock)
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('delrace4', timeout => 1); perform pgflow.add_step('delrace4', 'first'); perform pgflow.start_flow('delrace4', '{}'); perform pgflow.create_flow('delrace4b', timeout => 1); perform pgflow.add_step('delrace4b', 'first'); perform pgflow.start_flow('delrace4b', '{}'); end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.runs where flow_slug in ('delrace4','delrace4b') order by run_id for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.delete_flow_and_data('delrace4')$$);
select ok(pg_temp.wait_locked('drace_a'), 'deletion queues on the run lock');

select dblink_send_query('b', $$do $do$ begin perform pgflow.prune_data_older_than(interval '1 day'); end $do$;$$);
select ok(pg_temp.wait_locked('drace_b'), 'pruning queues on the run lock');

select dblink_exec('ctrl', 'commit');
select pg_temp.wait_settled('drace_a', 'drace_b');
create temporary table race4 as
select pg_temp.capture_result('a') as del_outcome,
       pg_temp.capture_result('b') as prune_outcome;
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'delrace4')
    + (select count(*)::int from pgmq.list_queues() where queue_name = 'delrace4'),
  (select case when (select del_outcome from race4) like 'error:%' then 1 else 0 end),
  'deletion/pruning contention: full deletion or full rollback, no deadlock'
);

-- ============================================================
-- RACE 5: deletion vs producer start_flow (definition lock)
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('delrace5', timeout => 1); perform pgflow.add_step('delrace5', 'first'); end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.flows where flow_slug = 'delrace5' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.delete_flow_and_data('delrace5')$$);
select ok(pg_temp.wait_locked('drace_a'), 'deletion queues on the flow row lock');

select dblink_send_query('b', $$select pgflow.start_flow('delrace5', '{}')$$);
select ok(pg_temp.wait_locked('drace_b'), 'producer queues on the flow row lock');

select dblink_exec('ctrl', 'commit');
select pg_temp.wait_settled('drace_a', 'drace_b');
create temporary table race5 as
select pg_temp.capture_result('a') as del_outcome,
       pg_temp.capture_result('b') as produce_outcome;
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'delrace5'),
  (select case when (select del_outcome from race5) like 'error:%' then 1 else 0 end),
  'deletion/producer contention: full deletion or full rollback, no deadlock'
);

-- ============================================================
-- RACE 6: external queue loss while deletion is fenced at the flow row
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('delrace6'); perform pgflow.add_step('delrace6', 'first'); end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.flows where flow_slug = 'delrace6' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.delete_flow_and_data('delrace6')$$);
select ok(pg_temp.wait_locked('drace_a'), 'deletion queues on the flow row lock');

-- External PGMQ drop commits while deletion is fenced: a rolled-back
-- conflict is acceptable; silent adoption/drop of uncertain resources is not.
select dblink_exec('b', $$do $do$ begin perform pgmq.drop_queue('delrace6'); end $do$;$$);

select dblink_exec('ctrl', 'commit');
select pg_temp.wait_settled('drace_a', 'drace_a');
select is(
  (select pg_temp.capture_result('a') like 'error:%'),
  true,
  'deletion rejects after external queue loss'
);
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'delrace6'),
  1,
  'rolled-back deletion leaves the flow intact'
);

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('ctrl');
select dblink_disconnect('probe');

select finish();
rollback;
