-- Test: late complete_task()/fail_task() callbacks blocked on the run row lock
-- while the run fails underneath them (the post-lock race).
--
-- The single-session tests in this directory commit the run failure before the
-- callback starts, so the callbacks always exit at the pre-lock EXISTS guard.
-- This test uses two dblink sessions to force the interleaving that guard
-- cannot cover:
--
--   1. ctrl session locks the run row (SELECT ... FOR UPDATE) in an open txn
--   2. late complete_task() and late fail_task() — both aimed at single_step,
--      the task the winning boom failure will CANCEL — pass their pre-lock
--      checks (run still 'started') and block on the run row lock.
--      pg_blocking_pids() proves the ctrl backend is in each callback's
--      blocking chain (second waiter queues behind the first; see the wait
--      loop below). single_step's step state stays 'started' when the run
--      fails, so the terminal-step guard cannot stop either callback: only
--      the post-lock failed-run guard protects the cancelled task here.
--   3. ctrl fails the run (fail_task on the culprit boom) and commits
--   4. both late callbacks resume, see status='failed' under the lock, and
--      must return without any mutation
--
-- The late completion is a single-to-map type violation (non-array output for
-- a step with a dependent map step): without the post-lock guard it would
-- rewrite the cancelled task to failed, move runs.failed_at, and duplicate
-- failure events. The late fail_task on the cancelled sibling would fall
-- through to the run UPDATE and wipe runs.failed_at while re-emitting
-- run:failed.
begin;
select plan(18);

create extension if not exists dblink;

-- Self-heal: terminate ctrl/late sessions leaked by a previously crashed run
-- of this test. They hold locks that would make the ctrl setup below hang.
select count(pg_terminate_backend(pid)) as terminated_stale_sessions
from pg_stat_activity
where application_name in ('race_ctrl', 'race_late_complete', 'race_late_fail')
  and pid <> pg_backend_pid();

-- Connection string for the ctrl/late dblink sessions (same DB as this test).
-- The setup must be committed by the ctrl session: rows created in this
-- transaction are invisible to dblink sessions.
select format(
  'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=',
  coalesce(host(inet_server_addr()), '127.0.0.1'),
  inet_server_port(),
  current_database()
) as conn_base \gset

select dblink_connect('ctrl', :'conn_base' || 'race_ctrl');
-- Fail fast (loud test error) if leaked locks from a crashed run would hang
-- setup/cleanup instead of blocking forever.
select dblink_exec('ctrl', 'set lock_timeout = 5000');

-- Committed setup: single_step feeds map_step (map, never started, so its
-- initial_tasks IS NULL and a non-array completion would be a TYPE_VIOLATION).
-- boom is an independent root whose exhaustion (max_attempts=1) fails the run
-- and cancels the started single_step task.
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.create_flow('race_flow', max_attempts => 1); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.add_step('race_flow', 'single_step'); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.add_step('race_flow', 'map_step', ARRAY['single_step'], step_type => 'map'); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.add_step('race_flow', 'boom'); end $do$;$$);

select run_id from dblink('ctrl', $$select run_id from pgflow.start_flow('race_flow', '{}'::jsonb)$$) as t(run_id uuid) \gset

select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.ensure_worker('race_flow'); end $do$;$$);

select msg_single from dblink('ctrl', $$select message_id from pgflow.step_tasks where step_slug = 'single_step' and task_index = 0$$) as t(msg_single bigint) \gset
select msg_boom from dblink('ctrl', $$select message_id from pgflow.step_tasks where step_slug = 'boom' and task_index = 0$$) as t(msg_boom bigint) \gset

select dblink_exec(
  'ctrl',
  format(
    $$do $do$ begin perform pgflow.start_tasks('race_flow', ARRAY[%s, %s]::bigint[], '11111111-1111-1111-1111-111111111111'::uuid); end $do$;$$,
    :'msg_single', :'msg_boom'
  )
);

-- RACE SETUP: ctrl holds the run row lock; both late callbacks block after
-- their pre-lock checks, at the FOR UPDATE inside the functions.
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', format($$do $do$ begin perform 1 from pgflow.runs where run_id = %L for update; end $do$;$$, :'run_id'));

-- Both late callbacks target single_step: the task the winning boom failure
-- will cancel (its step state stays 'started', so the terminal-step guard
-- cannot cover them). Late fail_task must NOT target the culprit boom —
-- boom's step state is terminal after the failure, so that callback would
-- never exercise the post-lock failed-run guard.
select dblink_connect('late_complete', :'conn_base' || 'race_late_complete');
-- Bound the lock wait: a stuck setup errors loudly instead of hanging.
select dblink_exec('late_complete', 'set lock_timeout = 30000');
select dblink_send_query(
  'late_complete',
  format(
    $$select status, output is null as output_is_null, error_message is null as error_is_null
       from pgflow.complete_task(%L, 'single_step', 0, '{"not": "an array"}'::jsonb) as cb$$,
    :'run_id'
  )
);

select dblink_connect('late_fail', :'conn_base' || 'race_late_fail');
select dblink_exec('late_fail', 'set lock_timeout = 30000');
select dblink_send_query(
  'late_fail',
  format(
    $$select status, error_message, failed_at is null as failed_at_is_null
       from pgflow.fail_task(%L, 'single_step', 0, 'late failure report') as ft$$,
    :'run_id'
  )
);

-- Probe connection for polling pg_stat_activity. Each dblink() call on it is a
-- single autocommit statement with a FRESH activity snapshot; this test
-- transaction's own pg_stat_activity view is cached from its first use
-- (the terminate above) and would never show the late sessions.
select dblink_connect('probe', :'conn_base' || 'race_probe');

-- Deterministic: wait until BOTH late callbacks are blocked by the ctrl
-- backend specifically. pg_blocking_pids() proves ctrl is in each callback's
-- blocking chain — not just that some lock wait exists. The chain matters:
-- PostgreSQL queues row-lock waiters FIFO, so the second callback blocks on
-- the first callback's tuple lock (its direct blocker), not on ctrl itself;
-- both still resume only after ctrl commits.
do $do$
declare
  blocked bigint;
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  perform pg_sleep(0.2);  -- let the late callbacks reach their lock waits
  loop
    select blocked_count into blocked
    from dblink('probe', $q$
      with recursive blockers as (
        select late.pid as late_pid, b.pid as blocker_pid
        from pg_stat_activity late
        cross join lateral unnest(pg_blocking_pids(late.pid)) as b(pid)
        where late.application_name in ('race_late_complete', 'race_late_fail')
          and late.wait_event_type = 'Lock'
        union
        select bl.late_pid, nb.pid
        from blockers bl
        join pg_stat_activity blocker on blocker.pid = bl.blocker_pid
        cross join lateral unnest(pg_blocking_pids(blocker.pid)) as nb(pid)
      )
      select count(distinct late_pid) as blocked_count
      from blockers
      where blocker_pid in (
        select pid from pg_stat_activity where application_name = 'race_ctrl'
      )
    $q$) as t(blocked_count bigint);
    exit when blocked = 2;
    if clock_timestamp() > deadline then
      raise exception 'late callbacks never blocked on the ctrl backend (blocked by ctrl: %/2)', blocked;
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$do$;

-- Fail the run and commit: the lock releases and both late callbacks resume
-- with a committed failed run.
select dblink_exec('ctrl', format($$do $do$ begin perform pgflow.fail_task(%L, 'boom', 0, 'boom failed for the race test'); end $do$;$$, :'run_id'));
select dblink_exec('ctrl', 'commit');

-- Wait until both async late-callback queries have finished.
do $do$
declare
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    exit when dblink_is_busy('late_complete') = 0 and dblink_is_busy('late_fail') = 0;
    if clock_timestamp() > deadline then
      raise exception 'late callbacks did not finish after the run failure commit';
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$do$;

-- Late complete_task returns the cancelled row untouched: no output stored,
-- no TYPE_VIOLATION error written. (One get_result call: the result set is
-- consumed by the first fetch, so assert on all columns at once.)
select is(
  (status, output_is_null, error_is_null),
  ('cancelled'::text, true, true),
  'Late complete_task should return the cancelled task row unchanged: no output, no TYPE_VIOLATION error'
) from dblink_get_result('late_complete') as r(status text, output_is_null boolean, error_is_null boolean);

-- Late fail_task also returns the cancelled sibling row untouched: no late
-- error message, no failed_at timestamp.
select is(
  (status, error_message, failed_at_is_null),
  ('cancelled'::text, null::text, true),
  'Late fail_task should return the cancelled sibling task row unchanged: no error, no failed_at'
) from dblink_get_result('late_fail') as r(status text, error_message text, failed_at_is_null boolean);

select dblink_disconnect('late_complete');
select dblink_disconnect('late_fail');

-- Cancelled task history is preserved after BOTH late callbacks.
select is(
  (select status from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'single_step' and task_index = 0),
  'cancelled',
  'single_step task should stay cancelled after the race'
);

select is(
  (select output from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'single_step' and task_index = 0),
  null,
  'single_step task output should stay null after the race'
);

select is(
  (select error_message from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'single_step' and task_index = 0),
  null,
  'single_step task error_message should stay null after the late fail_task'
);

select is(
  (select attempts_count from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'single_step' and task_index = 0),
  1,
  'single_step attempts_count should stay 1 after the race'
);

select is(
  (select completed_at from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'single_step' and task_index = 0),
  null,
  'single_step completed_at should stay null after the race'
);

select is(
  (select failed_at from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'single_step' and task_index = 0),
  null,
  'single_step failed_at should stay null after the race'
);

-- The culprit stays genuinely failed with the winning failure's history.
select is(
  (select status from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'boom' and task_index = 0),
  'failed',
  'boom task should stay genuinely failed after the race'
);

select is(
  (select error_message from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'boom' and task_index = 0),
  'boom failed for the race test',
  'boom error_message should keep the winning failure report, not a late callback one'
);

-- Run state: failed once, failed_at not moved, counters not decremented again.
select is(
  (select status from pgflow.runs where run_id = :'run_id'::uuid),
  'failed',
  'Run should be failed after the race'
);

select is(
  (select failed_at from pgflow.runs where run_id = :'run_id'::uuid),
  (select failed_at from pgflow.step_tasks
   where run_id = :'run_id'::uuid and step_slug = 'boom' and task_index = 0),
  'runs.failed_at should stay the run-failure timestamp, not be moved or wiped by a late callback'
);

select is(
  (select remaining_steps from pgflow.runs where run_id = :'run_id'::uuid),
  3,
  'remaining_steps should stay unchanged by the late callbacks'
);

select is(
  (select status from pgflow.step_states
   where run_id = :'run_id'::uuid and step_slug = 'single_step'),
  'started',
  'single_step state should stay started (run failure does not terminalize step states)'
);

-- No duplicate failure events from the late callbacks.
select is(
  pgflow_tests.count_realtime_events('run:failed', :'run_id'::uuid),
  1,
  'run:failed should be sent exactly once'
);

select is(
  pgflow_tests.count_realtime_events('step:failed', :'run_id'::uuid, 'single_step'),
  0,
  'late callbacks should not emit a step:failed event for the cancelled single_step'
);

select is(
  pgflow_tests.count_realtime_events('step:failed', :'run_id'::uuid, 'boom'),
  1,
  'step:failed for the culprit should be sent exactly once'
);

-- Queue is empty: culprit archived by the failure path, cancelled sibling
-- archived by terminalization, late-callback archival is a no-op.
-- Read via the probe connection: a direct read here would hold an
-- AccessShareLock that blocks the cleanup's drop_queue on this queue.
select is(
  (select c from dblink('probe', 'select count(*) from pgmq.q_race_flow') as t(c bigint)),
  0::bigint,
  'Queue should be empty after the race'
);

-- Cleanup committed data created by the dblink sessions (this transaction's
-- own changes roll back with the test). reset_db() does not clear pgflow.workers,
-- so remove the test worker explicitly.
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', $$delete from pgflow.workers where queue_name = 'race_flow'$$);
select dblink_disconnect('ctrl');
select dblink_disconnect('probe');

select * from finish();
rollback;
