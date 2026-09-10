-- Concurrent claim races (#650): only committed guarded claims return, a
-- visible started message consumes no attempt from a competing claim, and a
-- committed fatal outcome is observable from a third connection with its
-- pause/reset committed while no task mutation escapes.
begin;
select plan(11);

create extension if not exists dblink;

select count(pg_terminate_backend(pid)) as terminated_stale_sessions
from pg_stat_activity
where application_name in ('crace_ctrl', 'crace_a', 'crace_b', 'crace_probe')
  and pid <> pg_backend_pid();

select format(
  'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=',
  coalesce(host(inet_server_addr()), '127.0.0.1'),
  inet_server_port(),
  current_database()
) as conn_base \gset

select dblink_connect('ctrl', :'conn_base' || 'crace_ctrl');
select dblink_exec('ctrl', 'set lock_timeout = 20000');
select dblink_connect('probe', :'conn_base' || 'crace_probe');

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

select dblink_connect('a', :'conn_base' || 'crace_a');
select dblink_exec('a', 'set lock_timeout = 20000');
select dblink_connect('b', :'conn_base' || 'crace_b');
select dblink_exec('b', 'set lock_timeout = 20000');

-- ============================================================
-- RACE 1: two competing claims of the same read batch
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('crace1', timeout => 5); perform pgflow.add_step('crace1', 'first'); perform pgflow.start_flow('crace1', '{}'); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.ensure_worker('crace1'); end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.step_tasks where flow_slug = 'crace1' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.claim_tasks('crace1','crace1',ARRAY[1]::bigint[],'11111111-1111-1111-1111-111111111111'::uuid)$$);
select ok(pg_temp.wait_locked('crace_a'), 'first claim queues on the task row lock');

select dblink_send_query('b', $$select pgflow.claim_tasks('crace1','crace1',ARRAY[1]::bigint[],'11111111-1111-1111-1111-111111111111'::uuid)$$);
select ok(pg_temp.wait_locked('crace_b'), 'competing claim queues behind the first');

select dblink_exec('ctrl', 'commit');

create temporary table race1 as
select pg_temp.capture_result('a') as a_outcome,
       pg_temp.capture_result('b') as b_outcome;

select is(
  (select attempts_count from dblink('probe', 'select attempts_count from pgflow.step_tasks where flow_slug = ''crace1''') as t(attempts_count int)),
  1,
  'exactly one committed claim consumes the single attempt'
);
select is(
  (select status from dblink('probe', 'select status from pgflow.step_tasks where flow_slug = ''crace1''') as t(status text)),
  'started',
  'the task is started once'
);

-- ============================================================
-- RACE 2: claim vs fail_task cannot partially mutate
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('crace2', timeout => 5); perform pgflow.add_step('crace2', 'first'); perform pgflow.start_flow('crace2', '{}'); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.ensure_worker('crace2'); end $do$;$$);

select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.runs where flow_slug = 'crace2' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.claim_tasks('crace2','crace2',ARRAY[1]::bigint[],'11111111-1111-1111-1111-111111111111'::uuid)$$);
select ok(pg_temp.wait_locked('crace_a'), 'claim queues on the run row lock');

select dblink_send_query('b', $$select pgflow.fail_task((select run_id from pgflow.runs where flow_slug='crace2'), 'first', 0, 'boom')$$);
select ok(pg_temp.wait_locked('crace_b'), 'fail_task queues on the run row lock');

select dblink_exec('ctrl', 'commit');
select pg_temp.capture_result('a');
select pg_temp.capture_result('b');

select ok(
  (select attempts from dblink('probe', 'select attempts_count as attempts from pgflow.step_tasks where flow_slug = ''crace2''') as t(attempts int)) <= 1,
  'claim and failure contention consumes at most one attempt (no partial mutation)'
);

-- ============================================================
-- RACE 3: committed fatal outcome inspected from a third connection
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('crace3', timeout => 5); perform pgflow.add_step('crace3', 'first'); perform pgflow.start_flow('crace3', '{}'); perform pgflow_tests.ensure_worker('crace3', function_name => 'crace3_worker'); perform pgflow.track_worker_function('crace3_worker'); perform pgmq.send('crace3', '{"flow_slug":"crace3","run_id":"not-a-uuid"}'); perform pgflow_tests.reset_message_visibility('crace3'); end $do$;$$);

-- Read (autocommit connection A), then claim (autocommit connection B): the
-- real two-transaction worker path. B claims the same visible batch A read.
select count(*) as read_rows
from dblink('a', $$select msg_id from pgmq.q_crace3$$) as t(msg_id bigint);

select is(
  (select r->>'status' from dblink('b', $$
    select pgflow.claim_tasks(
      'crace3', 'crace3',
      (select array_agg(msg_id order by msg_id) from pgmq.q_crace3),
      '11111111-1111-1111-1111-111111111111'::uuid) as r
    $$) as t(r jsonb)),
  'fatal',
  'committed fatal result returns normally from an autocommit claim'
);

-- Third connection (probe) observes the committed pause and reset
select is(
  (select enabled from dblink('probe', 'select enabled from pgflow.worker_functions where function_name = ''crace3_worker''') as t(enabled boolean)),
  false,
  'HTTP restart pause is committed and visible to a third connection'
);
select ok(
  (select bool_and(vt <= clock_timestamp()) from dblink('probe', 'select vt from pgmq.q_crace3') as t(vt timestamptz)),
  'the complete read batch is reset and visible to a third connection'
);
select is(
  (select attempts_count from dblink('probe', 'select attempts_count from pgflow.step_tasks where flow_slug = ''crace3''') as t(attempts_count int)),
  0,
  'no task attempt escapes the committed fatal outcome'
);

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('ctrl');
select dblink_disconnect('probe');

select finish();
rollback;
