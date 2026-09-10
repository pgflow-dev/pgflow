-- Storage and producer snapshot coverage for persisted queue identity (#650).
-- Exact concrete spelling is preserved; definition and task snapshots are
-- canonical. Includes map ordering and start-delay coverage.
begin;
select plan(14);
select pgflow_tests.reset_db();

-- ---------- Single-step flow: spelling and snapshots ----------
select pgflow.create_flow('Orders');
select pgflow.add_step('Orders', 'first');
select pgflow.start_flow('Orders', '{}');

select is(
  (select flow_slug from pgflow.flows),
  'Orders',
  'flow spelling is preserved'
);

select is(
  (select queue_name from pgflow.steps),
  'orders',
  'step route is canonical'
);

select is(
  (select queue_name from pgflow.step_tasks),
  'orders',
  'task snapshots the route'
);

select ok(
  (select message_id is not null from pgflow.step_tasks),
  'producer stores a message ID'
);

select is(
  (select message->>'flow_slug' from pgmq.q_orders),
  'Orders',
  'queue message carries exact concrete flow spelling'
);

-- ---------- Map ordering: task_index ordinality matches message order ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('Invoices');
select pgflow.add_step('Invoices', 'first');
select pgflow.add_step('Invoices', 'eachItem', step_type => 'map');
select pgflow.start_flow('Invoices', '[10, 20, 30]');

select results_eq(
  $$
    select message->>'task_index'
    from pgmq.q_invoices
    where message->>'step_slug' = 'eachItem'
    order by msg_id
  $$,
  $$ values ('0'), ('1'), ('2') $$,
  'map task indices preserve per-step ordinality'
);

select results_eq(
  $$ select task_index::text from pgflow.step_tasks where step_slug = 'eachItem' order by task_index $$,
  $$ values ('0'), ('1'), ('2') $$,
  'map tasks are recorded in ordinal order'
);

-- ---------- Start delay: messages sent to the resolved route carry the delay ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('Delays', timeout => 5);
select pgflow.add_step('Delays', 'later', start_delay => 17);
select pgflow.start_flow('Delays', '{}');

select ok(
  (select vt > enqueued_at + interval '10 seconds' from pgmq.q_delays),
  'start delay is applied on the resolved route'
);

-- ---------- Snapshot immutability and pair uniqueness ----------
select pgflow_tests.reset_db();
select pgflow.create_flow('SnapA');
select pgflow.add_step('SnapA', 'first');
select pgflow.create_flow('SnapB');
select pgflow.add_step('SnapB', 'first');
select pgflow.start_flow('SnapA', '{}');
select pgflow.start_flow('SnapB', '{}');

select ok(
  (select message_id from pgflow.step_tasks where flow_slug = 'SnapA')
    = (select message_id from pgflow.step_tasks where flow_slug = 'SnapB'),
  'two private queues share message ID 1 by design'
);

select lives_ok(
  $$update pgflow.step_tasks set status = 'started' where flow_slug = 'SnapA'$$,
  'an identical queue update is harmless'
);

select lives_ok(
  $$insert into pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, queue_name, message_id)
    select 'SnapA', run_id, 'first', 1, 'snapa', null from pgflow.runs where flow_slug = 'SnapA'$$,
  'null-ID task insert succeeds for the immutability probe'
);

select throws_ok(
  $$update pgflow.step_tasks set queue_name = 'snapb' where flow_slug = 'SnapA' and task_index = 1$$,
  'step_tasks.queue_name is immutable',
  'a changed queue rejects'
);

select throws_ok(
  $$insert into pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, queue_name, message_id)
    select 'SnapA', run_id, 'first', 1, 'snapa',
      (select message_id from pgflow.step_tasks where flow_slug = 'SnapB')
    from pgflow.runs where flow_slug = 'SnapA'$$,
  '23505', null,
  'the same non-null queue/message pair rejects'
);

select lives_ok(
  $$insert into pgflow.step_tasks (flow_slug, run_id, step_slug, task_index, queue_name, message_id)
    select 'SnapA', run_id, 'first', 2, 'snapa', null from pgflow.runs where flow_slug = 'SnapA'$$,
  'multiple null-ID tasks succeed'
);

select finish();
rollback;
