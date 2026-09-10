-- Deletion validates private queue ownership before dropping anything (#650).
-- Missing/ambiguous/malformed/differently-owned resources and out-of-route
-- task snapshots leave all rows and resources unchanged.
begin;
select plan(13);
select pgflow_tests.reset_db();

-- ---------- Happy path: camelCase compiled flow with live data ----------
select pgflow.create_flow('Orders');
select pgflow.add_step('Orders', 'first');
select pgflow.start_flow('Orders', '{}');
-- Archived history for the same flow
select pgflow_tests.ensure_worker('orders');
select pgflow_tests.read_and_start('Orders');
select pgflow.complete_task(
  (select run_id from pgflow.step_tasks where flow_slug = 'Orders'),
  'first', 0, '"done"'::jsonb
);
-- Another queue that must remain untouched
select pgmq.create('unrelated_app');

select lives_ok(
  $$select pgflow.delete_flow_and_data('Orders')$$,
  'deleting a valid camelCase flow with live and archived data succeeds'
);
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'Orders'),
  0,
  'flow definition removed'
);
select is(
  (select count(*)::int from pgflow.runs where flow_slug = 'Orders'),
  0,
  'runtime rows removed'
);
select is(
  (select count(*)::int from pgmq.list_queues() where lower(queue_name) = 'orders'),
  0,
  'private queue and archive dropped'
);
select is(
  (select to_regclass('pgmq.q_orders')) is null,
  true,
  'queue table gone'
);
select is(
  (select to_regclass('pgmq.q_orders_msg_id_seq')) is null,
  true,
  'identity sequence gone'
);
select is(
  (select count(*)::int from pgmq.list_queues() where queue_name = 'unrelated_app'),
  1,
  'an unrelated application queue is untouched'
);

-- ---------- Missing metadata fails safely ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('Ghost');
select pgflow.add_step('Ghost', 'first');
delete from pgmq.meta where queue_name = 'ghost';
select throws_ok(
  $$select pgflow.delete_flow_and_data('Ghost')$$,
  'P0001', null,
  'missing metadata fails safely'
);
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'Ghost'),
  1,
  'failed deletion leaves the flow row (rollback)'
);
select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'Ghost'),
  1,
  'failed deletion leaves step definitions (rollback)'
);

-- ---------- Ambiguous metadata spelling fails safely ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('Ambig');
select pgflow.add_step('Ambig', 'first');
-- Simulate legacy mixed-case metadata plus a case alias of it
update pgmq.meta set queue_name = 'Ambig' where queue_name = 'ambig';
insert into pgmq.meta (queue_name, is_partitioned, is_unlogged)
values ('ambig', false, false);
select throws_ok(
  $$select pgflow.delete_flow_and_data('Ambig')$$,
  'P0001', null,
  'two metadata spellings fail safely'
);

-- ---------- Task snapshot outside the private route fails safely ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('Routed');
select pgflow.add_step('Routed', 'first');
select pgflow.start_flow('Routed', '{}');
-- Direct insert (the immutability trigger guards updates, not inserts)
insert into pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, queue_name, message_id)
select 'Routed', run_id, 'first', 99, 'elsewhere', null
from pgflow.runs where flow_slug = 'Routed';
select is(
  (select count(*)::int from pgflow.step_tasks where flow_slug = 'Routed' and queue_name = 'elsewhere'),
  1,
  'fixture: task snapshot outside the route'
);
select throws_ok(
  $$select pgflow.delete_flow_and_data('Routed')$$,
  'P0001', null,
  'a task snapshot outside the private route rejects deletion'
);

select finish();
rollback;
