-- 0.16.0 queue upgrade fixture seed (#650).
-- Runs on a database at 0.16.0 (migrations up to
-- 20260907082520_pgflow_remove_legacy_flow_compilation.sql only), BEFORE the
-- queue identity migration is applied. Produces the populated old database
-- the audit, startup probe, migration assertions, and rejection templates use.

-- camelCase flow: exact spelling 'Orders', PGMQ metadata 'Orders',
-- physical tables q_orders/a_orders (PGMQ lowercases table names only).
select pgflow.create_flow('Orders');
select pgflow.add_step('Orders', 'saveItem');
select pgflow.add_step('Orders', 'packBoxes', array['saveItem']);
select pgflow.add_step('Orders', 'audit');

-- Definition-only flow: no steps, no runs; old create_flow still
-- provisioned its queue.
select pgflow.create_flow('empty_flow');

-- Lowercase flow that will reach task failure exhaustion.
-- 1s retry base delay keeps the exhaustion loop inside a short poll window.
select pgflow.create_flow('billing', null, 1);
select pgflow.add_step('billing', 'charge');

-- Register an old worker the way 0.16.0 did (exact flow spelling).
select pgflow.track_worker_function('orders_worker');
insert into pgflow.workers (worker_id, queue_name, function_name, started_at, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'Orders', 'orders_worker', now(), now());

-- ==========================================
-- Orders run 1: complete the whole chain
-- ==========================================
select pgflow.start_flow('Orders', '"ord-1"'::jsonb);

-- Claim and complete saveItem (audit task stays queued with its message).
do $$
declare
  v_run uuid;
  v_ids bigint[];
begin
  select run_id into v_run from pgflow.runs where flow_slug = 'Orders';
  select array_agg(msg_id) into v_ids from pgmq.read('Orders', 30, 5);
  perform pgflow.start_tasks('Orders', v_ids, '11111111-1111-1111-1111-111111111111'::uuid);
  perform pgflow.complete_task(v_run, 'saveItem', 0, '"saved"'::jsonb);
end $$;

-- packBoxes became ready with its own message; complete it so the run ends.
do $$
declare
  v_run uuid;
  v_ids bigint[];
begin
  select run_id into v_run from pgflow.runs where flow_slug = 'Orders';
  select array_agg(msg_id) into v_ids from pgmq.read('Orders', 30, 5);
  perform pgflow.start_tasks('Orders', v_ids, '11111111-1111-1111-1111-111111111111'::uuid);
  perform pgflow.complete_task(v_run, 'packBoxes', 0, '"packed"'::jsonb);
end $$;

-- ==========================================
-- billing run 1: drive charge to exhaustion (message archived)
-- ==========================================
select pgflow.start_flow('billing', '"inv-1"'::jsonb);

do $$
declare
  v_run uuid;
  v_ids bigint[];
  v_attempt int;
begin
  select run_id into v_run from pgflow.runs where flow_slug = 'billing';
  for v_attempt in 1..3 loop
    select array_agg(msg_id) into v_ids from pgmq.read_with_poll('billing', 30, 5, 30, 500);
    perform pgflow.start_tasks('billing', v_ids, '11111111-1111-1111-1111-111111111111'::uuid);
    perform pgflow.fail_task(v_run, 'charge', 0, 'fixture: attempt ' || v_attempt);
  end loop;
end $$;

-- ==========================================
-- billing run 2: completed task that later lost its message ID
-- (historical NULL-message success row; the former message is removed as
-- fixture setup so the old queue holds no unmatched active message)
-- ==========================================
select pgflow.start_flow('billing', '"inv-2"'::jsonb);

do $$
declare
  v_run uuid;
  v_ids bigint[];
begin
  select run_id into v_run from pgflow.runs where flow_slug = 'billing' and input = '"inv-2"'::jsonb;
  select array_agg(msg_id) into v_ids from pgmq.read_with_poll('billing', 30, 5, 30, 500);
  perform pgflow.start_tasks('billing', v_ids, '11111111-1111-1111-1111-111111111111'::uuid);
  perform pgflow.complete_task(v_run, 'charge', 0, '"paid"'::jsonb);
  perform pgmq.archive('billing', v_ids);
  update pgflow.step_tasks set message_id = null
  where run_id = v_run and step_slug = 'charge';
end $$;

-- ==========================================
-- Unrelated application queue: never inspected by the audit
-- ==========================================
select pgmq.create('app_events');
select pgmq.send('app_events', '{"secret":"app-token-XYZ-3f9"}');
