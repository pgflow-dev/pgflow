-- Concurrent provisioning races for generated queue identity (#650).
--
-- Uses dblink sessions with pg_blocking_pids()/wait-state barriers (no elapsed
-- sleeps as proof): each race pins the interleaving by holding a lock the
-- victim must queue behind, observes the wait chain, then releases and requires
-- either one valid owner or total rollback of the losing transaction.
begin;
select plan(22);

create extension if not exists dblink;

-- Self-heal stale sessions leaked by previously crashed runs
select count(pg_terminate_backend(pid)) as terminated_stale_sessions
from pg_stat_activity
where application_name in ('qrace_ctrl', 'qrace_a', 'qrace_b', 'qrace_e', 'qrace_probe')
  and pid <> pg_backend_pid();

select format(
  'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=',
  coalesce(host(inet_server_addr()), '127.0.0.1'),
  inet_server_port(),
  current_database()
) as conn_base \gset

select dblink_connect('ctrl', :'conn_base' || 'qrace_ctrl');
select dblink_exec('ctrl', 'set lock_timeout = 20000');
select dblink_connect('probe', :'conn_base' || 'qrace_probe');

-- Deterministic wait until a named session waits on a Lock event, observed
-- through the probe connection (fresh activity snapshot per query).
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

-- Bounded wait until both named sessions stop running their async query.
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

-- Capture an async dblink result without letting an expected contention
-- error abort the test file: records the first row as text or the SQLSTATE
-- of the failure. Drains the connection so it accepts new async queries.
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
  -- Drain: dblink connections stay busy until get_result returns no rows.
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
end;
$fn$;

-- Drain a connection after a direct dblink_get_result assertion (including
-- errored queries) so later dblink_send_query calls do not fail.
create function pg_temp.drain_result(conn text)
returns void language plpgsql as $fn$
declare
  v_count int;
  v_guard int := 0;
begin
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
end;
$fn$;

-- ============================================================
-- RACE 1: concurrent 'Orders'/'orders' compilation
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);

-- ctrl holds the pgmq.meta topology fence; session A (compile 'Orders') must
-- queue behind it inside create_flow's collision inspection.
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', 'lock table pgmq.meta in share row exclusive mode');

select dblink_connect('a', :'conn_base' || 'qrace_a');
select dblink_exec('a', 'set lock_timeout = 20000');
select dblink_send_query('a',
  $$select pgflow.ensure_flow_compiled('Orders', '{"steps":[{"slug":"first","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}}]}'::jsonb, '{"version": 1}'::jsonb)$$);

select ok(
  pg_temp.wait_locked('qrace_a'),
  'compile A queues behind the metadata fence'
);

-- B compiles the case alias; it must queue behind A (shared canonical advisory lock)
select dblink_connect('b', :'conn_base' || 'qrace_b');
select dblink_exec('b', 'set lock_timeout = 20000');
select dblink_send_query('b',
  $$select pgflow.ensure_flow_compiled('orders', '{"steps":[{"slug":"first","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}}]}'::jsonb, '{"version": 1}'::jsonb)$$);

select ok(
  pg_temp.wait_locked('qrace_b'),
  'compile B queues behind the case-shared flow lock'
);

-- Release the fence: A wins, B must reject the alias atomically
select dblink_exec('ctrl', 'commit');

select is(
  (select r->>'status' from dblink_get_result('a') as t(r jsonb)),
  'compiled',
  'first case spelling compiles'
);
select pg_temp.drain_result('a');
select throws_ok(
  $$select r->>'status' from dblink_get_result('b') as t(r jsonb)$$,
  '23505', null,
  'case-alias compilation is rejected after losing the race'
);
select pg_temp.drain_result('b');
select is(
  (select flow_slug from pgflow.flows where lower(flow_slug) = 'orders'),
  'Orders',
  'exactly one spelling owns the definition'
);
select is(
  (select count(*)::int from pgmq.list_queues() where queue_name = 'orders'),
  1,
  'exactly one generated queue exists'
);

-- ============================================================
-- RACE 2: same exact compilation from two sessions
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', 'lock table pgmq.meta in share row exclusive mode');

select dblink_send_query('a',
  $$select pgflow.ensure_flow_compiled('Same', '{"steps":[{"slug":"first","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}}]}'::jsonb, '{"version": 1}'::jsonb)$$);
select ok(
  pg_temp.wait_locked('qrace_a'),
  'first compile queues behind the fence'
);
select dblink_send_query('b',
  $$select pgflow.ensure_flow_compiled('Same', '{"steps":[{"slug":"first","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}}]}'::jsonb, '{"version": 1}'::jsonb)$$);
select ok(
  pg_temp.wait_locked('qrace_b'),
  'second compile queues behind the first'
);
select dblink_exec('ctrl', 'commit');

select is(
  (select r->>'status' from dblink_get_result('a') as t(r jsonb)),
  'compiled',
  'first exact compile succeeds'
);
select pg_temp.drain_result('a');
select is(
  (select r->>'status' from dblink_get_result('b') as t(r jsonb)),
  'verified',
  'second exact compile verifies idempotently'
);
select pg_temp.drain_result('b');

-- ============================================================
-- RACE 3: concurrent add_step calls take distinct indexes
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); perform pgflow.create_flow('added'); perform pgflow.add_step('added', 'first'); end $do$;$$);
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', $$do $do$ begin perform 1 from pgflow.flows where flow_slug = 'added' for update; end $do$;$$);

select dblink_send_query('a', $$select pgflow.add_step('added', 'alpha')$$);
select ok(
  pg_temp.wait_locked('qrace_a'),
  'first add_step queues behind the flow row lock'
);
select dblink_send_query('b', $$select pgflow.add_step('added', 'beta')$$);
select ok(
  pg_temp.wait_locked('qrace_b'),
  'second add_step queues behind the first'
);
select dblink_exec('ctrl', 'commit');

select ok(
  pg_temp.capture_result('a') not like 'error:%',
  'first add_step succeeds'
);
select ok(
  pg_temp.capture_result('b') not like 'error:%',
  'second add_step succeeds'
);
select results_eq(
  $$ select step_slug || '=' || step_index::text from pgflow.steps where flow_slug = 'added' order by step_slug $$,
  $$ values ('alpha=1'), ('beta=2'), ('first=0') $$,
  'concurrent add_step calls take distinct sequential indexes'
);

-- ============================================================
-- RACE 4: direct building-block case alias while a compile is fenced
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', 'lock table pgmq.meta in share row exclusive mode');

select dblink_send_query('a',
  $$select pgflow.ensure_flow_compiled('Direct', '{"steps":[{"slug":"first","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}}]}'::jsonb, '{"version": 1}'::jsonb)$$);
select ok(
  pg_temp.wait_locked('qrace_a'),
  'compile queues behind the fence before inserting the identity'
);

-- Direct building-block INSERT (not a pgflow function) commits the alias
select dblink_exec('b', $$insert into pgflow.flows (flow_slug) values ('direct')$$);
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'direct'),
  1,
  'direct case-alias insert commits while the compile is fenced'
);

select dblink_exec('ctrl', 'commit');
create temporary table race4_outcome as
select pg_temp.capture_result('a') as a_outcome;

select is(
  (select a_outcome from race4_outcome) in ('error:23505', 'error:P0001'),
  true,
  'fenced compile rejects the committed case alias atomically'
);
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'Direct'),
  0,
  'losing compile leaves no definition'
);

-- ============================================================
-- RACE 5: external pgmq.create lands at the topology fence
-- ============================================================
select dblink_exec('ctrl', $$do $do$ begin perform pgflow_tests.reset_db(); end $do$;$$);
select dblink_exec('ctrl', 'begin');
select dblink_exec('ctrl', 'lock table pgmq.meta in share row exclusive mode');

select dblink_send_query('a',
  $$select pgflow.ensure_flow_compiled('Fresh', '{"steps":[{"slug":"first","stepType":"single","dependencies":[],"whenUnmet":"skip","whenExhausted":"fail","requiredInputPattern":{"defined":false},"forbiddenInputPattern":{"defined":false}}]}'::jsonb, '{"version": 1}'::jsonb)$$);
select ok(
  pg_temp.wait_locked('qrace_a'),
  'compile queues behind the fence'
);

-- External create: its metadata insert queues behind the fence
select dblink_connect('e', :'conn_base' || 'qrace_e');
select dblink_send_query('e', $$select pgmq.create('fresh')$$);
select ok(
  pg_temp.wait_locked('qrace_e'),
  'external create queues on the metadata fence'
);

-- Release: A and E contend; one must win, the loser rolls back entirely
select dblink_exec('ctrl', 'commit');
select pg_temp.wait_settled('qrace_a', 'qrace_e');

create temporary table race5_outcome as
select pg_temp.capture_result('a') as a_outcome;

-- Either one valid owner (flow + single metadata row) or total compile
-- rollback; never silent adoption of unowned objects into a live definition.
select ok(
  (
    (select a_outcome from race5_outcome) not like 'error:%'
    and exists(select 1 from pgflow.flows where flow_slug = 'Fresh')
    and (select count(*)::int from pgmq.meta where lower(queue_name) = 'fresh') = 1
  ) or (
    (select a_outcome from race5_outcome) like 'error:%'
    and not exists(select 1 from pgflow.flows where flow_slug = 'Fresh')
  ),
  'fence contention yields one valid owner or a full rollback'
);

-- Cleanup sessions
select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('e');
select dblink_disconnect('ctrl');
select dblink_disconnect('probe');

select finish();
rollback;
