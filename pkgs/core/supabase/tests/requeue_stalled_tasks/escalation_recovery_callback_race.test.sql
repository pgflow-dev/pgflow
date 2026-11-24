-- Exercise the transaction boundary between recovery, escalation and callbacks.
begin;
select plan(10);

create extension if not exists dblink;

select count(pg_terminate_backend(pid)) as terminated_stale_sessions
from pg_stat_activity
where application_name in ('stall_race_ctrl', 'stall_race_escalate', 'stall_race_callback', 'stall_race_probe')
  and pid <> pg_backend_pid();

select format(
  'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=',
  coalesce(host(inet_server_addr()), '127.0.0.1'),
  inet_server_port(),
  current_database()
) as conn_base \gset

select dblink_connect('ctrl', :'conn_base' || 'stall_race_ctrl');
select dblink_exec('ctrl', 'set lock_timeout = 5000');
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.create_flow('stallrace', timeout => 5, max_attempts => 10); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.add_step('stallrace', 'step_a'); end $do$;$$);
select run_id from dblink('ctrl', $$select run_id from pgflow.start_flow('stallrace', '{}'::jsonb)$$) as t(run_id uuid) \gset
select msg_id from dblink('ctrl', $$select message_id from pgflow.step_tasks where flow_slug = 'stallrace'$$) as t(msg_id bigint) \gset
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.ensure_worker('stallrace'); end $do$;$$);
select dblink_exec(
  'ctrl',
  format(
    $$do $do$ begin perform pgflow.start_tasks('stallrace', ARRAY[%L::bigint], '11111111-1111-1111-1111-111111111111'::uuid, 'stallrace'); end $do$;$$,
    :'msg_id'
  )
);

-- An escalation pass must not see a stamp before recovery commits.
select dblink_exec('ctrl', 'begin');
select dblink_exec(
  'ctrl',
  format(
    $$update pgflow.step_tasks set queued_at = now() - interval '80 seconds', started_at = now() - interval '40 seconds', requeued_count = 3 where run_id = %L::uuid$$,
    :'run_id'
  )
);
select is(
  (select requeued from dblink('ctrl', $$select pgflow.requeue_stalled_tasks()$$) as result(requeued int)),
  0,
  'recovery archives and marks the task in its own transaction'
);
select is(pgflow.escalate_permanently_stalled(), 0, 'escalation ignores an uncommitted stall marker');
select dblink_exec('ctrl', 'commit');

-- Hold the run row while escalation and callback pass initial checks.
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', format($$do $do$ begin perform 1 from pgflow.runs where run_id = %L for update; end $do$;$$, :'run_id'));

-- Escalation and callback both pass their initial checks, then wait on ctrl.
select dblink_connect('escalate', :'conn_base' || 'stall_race_escalate');
select dblink_exec('escalate', 'set lock_timeout = 30000');
select dblink_send_query('escalate', $$select pgflow.escalate_permanently_stalled()$$);

select dblink_connect('callback', :'conn_base' || 'stall_race_callback');
select dblink_exec('callback', 'set lock_timeout = 30000');
select dblink_send_query(
  'callback',
  format(
    $$select status from pgflow.complete_task(%L, 'step_a', 0, '{"result":"late callback"}'::jsonb)$$,
    :'run_id'
  )
);
select dblink_connect('probe', :'conn_base' || 'stall_race_probe');

do $do$
declare
  blocked bigint;
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    select blocked_count into blocked
    from dblink('probe', $q$
      with recursive blockers as (
        select waiting.pid as waiting_pid, blocker.pid as blocker_pid
        from pg_stat_activity waiting
        cross join lateral unnest(pg_blocking_pids(waiting.pid)) as blocker(pid)
        where waiting.application_name in ('stall_race_escalate', 'stall_race_callback')
          and waiting.wait_event_type = 'Lock'
        union
        select chain.waiting_pid, next_blocker.pid
        from blockers chain
        join pg_stat_activity current_blocker on current_blocker.pid = chain.blocker_pid
        cross join lateral unnest(pg_blocking_pids(current_blocker.pid)) as next_blocker(pid)
      )
      select count(distinct waiting_pid)
      from blockers
      where blocker_pid in (
        select pid from pg_stat_activity where application_name = 'stall_race_ctrl'
      )
    $q$) as result(blocked_count bigint);
    exit when blocked = 2;
    if clock_timestamp() > deadline then
      raise exception 'escalation and callback did not both block on the control transaction (blocked: %/2)', blocked;
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$do$;

select dblink_exec('ctrl', 'commit');

do $do$
declare
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    exit when dblink_is_busy('escalate') = 0 and dblink_is_busy('callback') = 0;
    if clock_timestamp() > deadline then
      raise exception 'concurrent escalation and callback did not finish';
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$do$;

select status from dblink_get_result('callback') as result(status text);
select escalated from dblink_get_result('escalate') as result(escalated int);

select ok(
  (select status in ('failed', 'completed') from pgflow.step_tasks where run_id = :'run_id'::uuid),
  'concurrent escalation and callback leave a terminal task'
);

-- Read the queue from a short-lived transaction so this test does not hold
-- a table lock when the control connection drops the queue during cleanup.
select is(
  (select n from dblink('probe', 'select count(*) from pgmq.q_stallrace') as counts(n bigint)),
  0::bigint,
  'recovery and terminal paths leave no active queue message'
);

select is(
  (select n from dblink('probe', 'select count(*) from pgmq.a_stallrace') as counts(n bigint)),
  1::bigint,
  'recovery archives the message once'
);

select ok(
  (select (status = 'failed' and remaining_steps = 1) or (status = 'completed' and remaining_steps = 0)
   from pgflow.runs where run_id = :'run_id'::uuid),
  'the winning terminal transition leaves a consistent run counter'
);

select is(
  pgflow_tests.count_realtime_events('run:failed', :'run_id'::uuid)
    + pgflow_tests.count_realtime_events('run:completed', :'run_id'::uuid),
  1,
  'concurrent paths emit exactly one run terminal event'
);

select is(
  pgflow_tests.count_realtime_events('step:failed', :'run_id'::uuid, 'step_a')
    + pgflow_tests.count_realtime_events('step:completed', :'run_id'::uuid, 'step_a'),
  1,
  'concurrent paths emit exactly one step terminal event'
);

select is(
  (select count(*) from pgflow.step_tasks where run_id = :'run_id'::uuid and status in ('queued', 'started')),
  0::bigint,
  'concurrent paths leave no nonterminal task'
);

select dblink_disconnect('callback');
select dblink_disconnect('escalate');

-- A failure callback can wait on recovery's task lock while its own run
-- and step locks are held. When recovery commits, it must see the stamp
-- and exhaust the task, even though nine handler attempts remain.
select run_id from dblink('ctrl', $$select run_id from pgflow.start_flow('stallrace', '{}'::jsonb)$$) as t(run_id uuid) \gset
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.read_and_start('stallrace'); end $do$;$$);
select dblink_exec('ctrl', 'begin');
select dblink_exec(
  'ctrl',
  format(
    $$update pgflow.step_tasks set queued_at = now() - interval '80 seconds', started_at = now() - interval '40 seconds', requeued_count = 3 where run_id = %L::uuid$$,
    :'run_id'
  )
);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.requeue_stalled_tasks(); end $do$;$$);

select dblink_connect('callback', :'conn_base' || 'stall_race_callback');
select dblink_exec('callback', 'set lock_timeout = 15000');
select dblink_send_query(
  'callback',
  format($$select status from pgflow.fail_task(%L::uuid, 'step_a', 0, 'late failure')$$, :'run_id')
);

do $do$
declare
  blocked boolean;
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    select waiting from dblink('probe', $q$
      select exists (
        select 1
        from pg_stat_activity callback
        join pg_stat_activity recovery on recovery.pid = any(pg_blocking_pids(callback.pid))
        where callback.application_name = 'stall_race_callback'
          and recovery.application_name = 'stall_race_ctrl'
      )
    $q$) as result(waiting boolean) into blocked;
    exit when blocked;
    if clock_timestamp() > deadline then
      raise exception 'failure callback did not wait for recovery to commit';
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$do$;

select dblink_exec('ctrl', 'commit');
select is(
  (select status from dblink_get_result('callback') as result(status text)),
  'failed',
  'a waiting failure callback sees the committed marker and does not retry the archived task'
);

select dblink_disconnect('callback');
select dblink_disconnect('probe');
select dblink_exec('ctrl', $$delete from pgflow.workers where queue_name = 'stallrace'$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.delete_flow_and_data('stallrace'); end $do$;$$);
select dblink_disconnect('ctrl');

select finish();
rollback;
