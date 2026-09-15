-- Regression (#651): every flow-definition writer serializes on the same
-- normalized-flow advisory lock as ensure_flow_compiled.
--
-- Without the shared lock, a public create_flow()/add_step() call (or a
-- delete_flow_and_data() call) can interleave with a concurrent
-- ensure_flow_compiled() for the same flow: both check the queue listing
-- before either creates it, max(step_index)+1 reads race, and a delete can
-- run underneath a compiling worker.
--
-- This test uses dblink sessions to prove the serialization deterministically:
--
--   1. ctrl session holds pg_advisory_xact_lock(1, hashtext(lower(slug)))
--      for two slugs in one open transaction
--   2. conn A sends ensure_flow_compiled() for a missing 2-step flow
--      (compiles through _create_flow_from_shape -> create_flow/add_step)
--   3. conn B sends the public incremental path create_flow()+add_step()
--      for the same flow
--   4. conn C sends delete_flow_and_data() for a second, existing flow
--   5. pg_blocking_pids() must show A, B, and C all blocked in ctrl's
--      blocking chain: each writer takes the same normalized lock at entry,
--      before any table or queue work
--   6. ctrl rolls back; all three writers finish; the compiled definition
--      converges to exactly one consistent flow regardless of grant order
begin;
select plan(10);

create extension if not exists dblink;

-- Self-heal: terminate sessions leaked by a previously crashed run of this
-- test. They hold locks that would make the ctrl setup below hang.
select count(pg_terminate_backend(pid)) as terminated_stale_sessions
from pg_stat_activity
where application_name in ('race_ctrl', 'race_a', 'race_b', 'race_c', 'race_probe')
  and pid <> pg_backend_pid();

-- Connection string for the ctrl/writer/probe dblink sessions (same DB as
-- this test). Setup must be committed by the ctrl session: rows created in
-- this transaction are invisible to dblink sessions.
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

-- Committed setup: a clean database plus the flow that conn C will delete.
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pgflow.create_flow('race_delete_flow'); end $do$;$$);

-- RACE SETUP: ctrl holds the normalized advisory locks for both slugs in
-- one open transaction. These are the exact locks ensure_flow_compiled
-- takes; every other definition writer must take the same ones first.
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform pg_advisory_xact_lock(1, hashtext(lower('race_flow'))); end $do$;$$);
select dblink_exec('ctrl', $$do $do$ begin perform pg_advisory_xact_lock(1, hashtext(lower('race_delete_flow'))); end $do$;$$);

-- conn A: startup compilation for the missing flow (internal creation path).
select dblink_connect('a', :'conn_base' || 'race_a');
select dblink_exec('a', 'set lock_timeout = 30000');
select dblink_send_query(
  'a',
  $$select result->>'status' as status
    from pgflow.ensure_flow_compiled(
      'race_flow',
      '{
        "steps": [
          {"slug": "first", "stepType": "single", "dependencies": [], "whenUnmet": "skip", "whenExhausted": "fail"},
          {"slug": "second", "stepType": "single", "dependencies": ["first"], "whenUnmet": "skip", "whenExhausted": "fail"}
        ]
      }'::jsonb
    ) as result$$
);

-- conn B: the public incremental definition path for the same flow.
select dblink_connect('b', :'conn_base' || 'race_b');
select dblink_exec('b', 'set lock_timeout = 30000');
select dblink_send_query(
  'b',
  $$do $do$
    begin
      perform pgflow.create_flow('race_flow');
      perform pgflow.add_step('race_flow', 'first');
      perform pgflow.add_step('race_flow', 'second', ARRAY['first']);
    end
  $do$;$$
);

-- conn C: destructive deletion of the second flow.
select dblink_connect('c', :'conn_base' || 'race_c');
select dblink_exec('c', 'set lock_timeout = 30000');
select dblink_send_query(
  'c',
  $$select count(*) as deleted from pgflow.delete_flow_and_data('race_delete_flow') as t(v)$$
);

-- Probe connection for polling pg_stat_activity. Each dblink() call on it is
-- a single autocommit statement with a FRESH activity snapshot; this test
-- transaction's own pg_stat_activity view is cached from its first use (the
-- terminate above) and would never show the writer sessions.
select dblink_connect('probe', :'conn_base' || 'race_probe');

-- Deterministic: wait until all three writers are blocked by the ctrl
-- backend specifically. pg_blocking_pids() proves ctrl is in each writer's
-- blocking chain — not just that some lock wait exists. Advisory-lock
-- waiters queue behind the holder, so a writer that skipped the normalized
-- lock would finish instead of blocking and this count would stay below 3.
do $do$
declare
  blocked bigint;
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  perform pg_sleep(0.2);  -- let the writers reach their lock waits
  loop
    select blocked_count into blocked
    from dblink('probe', $q$
      with recursive blockers as (
        select w.pid as writer_pid, b.pid as blocker_pid
        from pg_stat_activity w
        cross join lateral unnest(pg_blocking_pids(w.pid)) as b(pid)
        where w.application_name in ('race_a', 'race_b', 'race_c')
          and w.wait_event_type = 'Lock'
        union
        select bl.writer_pid, nb.pid
        from blockers bl
        join pg_stat_activity blocker on blocker.pid = bl.blocker_pid
        cross join lateral unnest(pg_blocking_pids(blocker.pid)) as nb(pid)
      )
      select count(distinct writer_pid) as blocked_count
      from blockers
      where blocker_pid in (
        select pid from pg_stat_activity where application_name = 'race_ctrl'
      )
    $q$) as t(blocked_count bigint);
    exit when blocked = 3;
    if clock_timestamp() > deadline then
      raise exception 'definition writers never blocked on the ctrl advisory lock (blocked by ctrl: %/3)', blocked;
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$do$;

select ok(
  true,
  'ensure_flow_compiled, create_flow+add_step, and delete_flow_and_data all block on the same normalized-flow advisory lock'
);

-- Release: ctrl rolls back without doing any work of its own.
select dblink_exec('ctrl', 'rollback');

-- Wait until all three async writer queries have finished. A failed writer
-- raises here (dblink_get_result below would also raise), so reaching the
-- assertions proves all three completed without error.
do $do$
declare
  deadline timestamptz := clock_timestamp() + interval '30 seconds';
begin
  loop
    exit when dblink_is_busy('a') = 0 and dblink_is_busy('b') = 0 and dblink_is_busy('c') = 0;
    if clock_timestamp() > deadline then
      raise exception 'definition writers did not finish after the advisory lock release';
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$do$;

-- Whichever writer was granted the lock first, compilation and the
-- incremental path converge: ensure_flow_compiled reports compiled (it ran
-- first) or verified (the public path won the race).
select status from dblink_get_result('a') as r(status text) \gset
select ok(
  :'status' in ('compiled', 'verified'),
  format('ensure_flow_compiled should compile or verify the racing flow, got %s', :'status')
);

-- A failed async query raises here, so these fetches prove B and C both
-- completed without error after the lock release.
select is(
  (select count(*)::int from dblink_get_result('b') as r(result text)),
  1,
  'the public create_flow()+add_step() path completes without error (one DO tag row)'
);

select is(
  (select deleted::int from dblink_get_result('c') as r(deleted bigint)),
  1,
  'delete_flow_and_data completes its one-row void result without error'
);
-- One consistent definition, not a doubled one, regardless of grant order.
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'race_flow'),
  1,
  'exactly one flow row survives the race'
);

select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'race_flow'),
  2,
  'exactly two step rows survive the race'
);

select is(
  (select count(distinct step_index)::int from pgflow.steps where flow_slug = 'race_flow'),
  2,
  'racing add_step calls cannot produce duplicate step indexes'
);

select results_eq(
  $$ select step_slug || ' -> ' || queue_name
     from pgflow.steps where flow_slug = 'race_flow'
     order by step_index $$,
  $$ values ('first'::text || ' -> ' || 'race_flow'), ('second'::text || ' -> ' || 'race_flow') $$,
  'both steps keep the canonical default route'
);

select is(
  (select count(*) from pgmq.list_queues() where queue_name = 'race_flow'),
  1::bigint,
  'the default queue is created exactly once'
);

-- The deletion completed cleanly under the same serialization.
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'race_delete_flow'),
  0,
  'delete_flow_and_data removed the second flow while writers were serialized'
);

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
-- Cleanup committed data created by the dblink sessions (this transaction's
-- own changes roll back with the test). reset_db() does not clear
-- pgflow.workers, so remove any test workers explicitly.
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', $$delete from pgflow.workers where queue_name in ('race_flow', 'race_delete_flow')$$);
select dblink_disconnect('ctrl');
select dblink_disconnect('probe');

select * from finish();
rollback;
