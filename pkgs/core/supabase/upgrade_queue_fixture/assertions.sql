-- 0.16.0 queue upgrade fixture assertions (#650).
-- Runs AFTER the queue identity migration on the main seeded old database.
-- Plain DO-block asserts (the fixture container image has no pgTAP);
-- any failure raises, psql runs with ON_ERROR_STOP=1, the script exits
-- non-zero. The runner additionally diffs captured pre/post state signatures.

-- ==========================================
-- 1. Backfill: canonical snapshots everywhere, NULL IDs preserved
-- ==========================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count from pgflow.steps
  where queue_name is distinct from lower(flow_slug);
  if v_count <> 0 then
    raise exception 'steps backfill: % rows not canonical', v_count;
  end if;

  select count(*) into v_count from pgflow.step_tasks
  where queue_name is distinct from lower(flow_slug);
  if v_count <> 0 then
    raise exception 'step_tasks backfill: % rows not canonical', v_count;
  end if;

  if not exists (
    select 1 from pgflow.step_tasks t
    join pgflow.runs r on r.run_id = t.run_id
    where r.flow_slug = 'billing' and r.input = '"inv-2"'::jsonb
      and t.message_id is null and t.status = 'completed'
  ) then
    raise exception 'NULL-message completed task lost by migration';
  end if;
end $$;

-- ==========================================
-- 2. Exact PGMQ metadata spelling preserved until pgflow deletes it
-- ==========================================
do $$
begin
  if not exists (select 1 from pgmq.meta where queue_name = 'Orders') then
    raise exception 'metadata spelling ''Orders'' was not preserved';
  end if;
end $$;

-- ==========================================
-- 3. Partial unique (queue, message) pair constraint works
-- ==========================================
do $$
declare
  v_dup bigint;
begin
  select t.message_id into v_dup
  from pgflow.step_tasks t
  where t.queue_name = 'orders' and t.message_id is not null
  limit 1;

  begin
    insert into pgflow.step_tasks (
      flow_slug, run_id, step_slug, task_index, queue_name, message_id, status
    )
    select t.flow_slug, t.run_id, 'packBoxes', 1, 'orders', v_dup, 'queued'
    from pgflow.step_tasks t
    where t.queue_name = 'orders' and t.message_id = v_dup
    limit 1;
    raise exception 'duplicate (queue, message) pair insert was accepted';
  exception when unique_violation then
    -- expected
  end;
end $$;

-- ==========================================
-- 4. Startup handshake: new signature only, canonical queue answer
-- ==========================================
do $$
declare
  v_sig_count int;
  v_result jsonb;
begin
  select count(*) into v_sig_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pgflow' and p.proname = 'ensure_flow_compiled';
  if v_sig_count <> 1 then
    raise exception 'ensure_flow_compiled overloads present: % (expected exactly the 3-arg function)', v_sig_count;
  end if;

  select pgflow.ensure_flow_compiled(
    'Orders', pgflow._get_flow_shape('Orders'), '{"version":1}'::jsonb
  ) into v_result;
  if v_result ->> 'queue_name' is distinct from 'orders'
     or v_result ->> 'protocol_version' is distinct from '1' then
    raise exception 'ensure_flow_compiled answered %', v_result;
  end if;

  begin
    perform pgflow.ensure_flow_compiled('Orders', pgflow._get_flow_shape('Orders'), null);
    raise exception 'null protocol argument accepted';
  exception when others then
    if sqlerrm not like '%Queue-capable worker protocol%' then
      raise;
    end if;
  end;
end $$;

-- ==========================================
-- 5. Claims and callbacks work on mixed-case identity (started deferral)
-- ==========================================
do $$
declare
  v_ids bigint[];
  v_result jsonb;
begin
  insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
  values ('22222222-2222-2222-2222-222222222222', 'orders', 'orders_worker', now(), now())
  on conflict (worker_id) do nothing;

  select array_agg(msg_id) into v_ids from pgmq.read('orders', 5, 10);
  select pgflow.claim_tasks('orders', 'Orders', v_ids, '22222222-2222-2222-2222-222222222222'::uuid)
  into v_result;

  if v_result ->> 'status' is distinct from 'ok'
     or jsonb_array_length(v_result -> 'tasks') <> 0 then
    raise exception 'mixed-case started-task deferral failed: %', v_result;
  end if;
end $$;

-- ==========================================
-- 6. Fresh plain flow end-to-end on the migrated database
-- ==========================================
do $$
declare
  v_ids bigint[];
  v_result jsonb;
  v_run uuid;
begin
  perform pgflow.create_flow('fresh');
  perform pgflow.add_step('fresh', 'work');
  select run_id into v_run from pgflow.start_flow('fresh', '"fresh-1"'::jsonb);

  insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
  values ('33333333-3333-3333-3333-333333333333', 'fresh', 'fresh_worker', now(), now())
  on conflict (worker_id) do nothing;

  select array_agg(msg_id) into v_ids from pgmq.read('fresh', 30, 5);
  select pgflow.claim_tasks('fresh', 'fresh', v_ids, '33333333-3333-3333-3333-333333333333'::uuid)
  into v_result;
  if v_result ->> 'status' <> 'ok' or jsonb_array_length(v_result -> 'tasks') <> 1 then
    raise exception 'fresh claim failed: %', v_result;
  end if;

  perform pgflow.complete_task(v_run, 'work', 0, '"done"'::jsonb);
  if not exists (select 1 from pgmq.a_fresh) then
    raise exception 'completed fresh task message was not archived via its snapshot';
  end if;
end $$;

-- ==========================================
-- 7. PGMQ 1.5.1 mixed-case lifecycle: delete through pgflow, recreate
-- ==========================================
do $$
begin
  perform pgflow.delete_flow_and_data('Orders');

  if exists (select 1 from pgmq.meta where lower(queue_name) = 'orders') then
    raise exception 'Orders metadata survived deletion';
  end if;
  if to_regclass('pgmq.q_orders') is not null
     or to_regclass('pgmq.a_orders') is not null
     or to_regclass('pgmq.q_orders_msg_id_seq') is not null then
    raise exception 'Orders physical objects survived deletion';
  end if;
  if exists (select 1 from pgflow.flows where flow_slug = 'Orders') then
    raise exception 'Orders flow row survived deletion';
  end if;
  if not exists (select 1 from pgmq.meta where queue_name = 'app_events') then
    raise exception 'unrelated application queue was disturbed by deletion';
  end if;

  -- Recreate with canonical metadata and execute again.
  perform pgflow.create_flow('Orders');
  perform pgflow.add_step('Orders', 'saveItem');
  if not exists (select 1 from pgmq.meta where queue_name = 'orders') then
    raise exception 'recompiled Orders did not provision canonical metadata ''orders''';
  end if;
  perform pgflow.start_flow('Orders', '"ord-2"'::jsonb);
  if not exists (select 1 from pgflow.step_tasks where flow_slug = 'Orders' and queue_name = 'orders') then
    raise exception 'recreated Orders task lacks canonical snapshot';
  end if;
end $$;
