-- Queue-aware lifecycle coverage (#650): every archive/retry/cancel path uses
-- the task's queue snapshot. PGMQ message IDs are queue-scoped, so two flows
-- each holding ID 1 must never interfere.
begin;
select plan(17);
select pgflow_tests.reset_db();

-- ============================================================
-- BLOCK 1: cross-queue isolation with shared message ID 1
-- ============================================================
select pgflow.create_flow('Orders', max_attempts => 1);
select pgflow.add_step('Orders', 'first');
select pgflow.create_flow('Invoices', max_attempts => 1);
select pgflow.add_step('Invoices', 'first');
select pgflow.start_flow('Orders', '{}');
select pgflow.start_flow('Invoices', '{}');

select is(
  (select message_id from pgflow.step_tasks where flow_slug = 'Orders'),
  (select message_id from pgflow.step_tasks where flow_slug = 'Invoices'),
  'fixture deliberately reuses an ID across queues'
);

-- Complete Orders' task: only the orders queue/archive change
select pgflow_tests.poll_and_complete('Orders');

select is(
  (select count(*)::int from pgmq.a_orders),
  1,
  'completion archives into the orders archive by snapshot'
);
select is(
  (select count(*)::int from pgmq.q_orders),
  0,
  'orders queue is drained'
);
select is(
  (select count(*)::int from pgmq.q_invoices),
  1,
  'the invoices queue keeps its own ID 1'
);
select is(
  (select count(*)::int from pgmq.a_invoices),
  0,
  'the invoices archive is untouched'
);

-- Fail Invoices' task (max_attempts=1: exhaustion, run fails)
select pgflow_tests.poll_and_fail('Invoices');

select is(
  (select count(*)::int from pgmq.a_invoices),
  1,
  'exhaustion archives into the invoices archive by snapshot'
);
select is(
  (select count(*)::int from pgflow.step_tasks where flow_slug = 'Invoices' and status = 'cancelled'),
  0,
  'single-task flow: the culprit itself terminalizes as failed'
);
select is(
  (select queue_name from pgflow.step_tasks where flow_slug = 'Orders'),
  'orders',
  'completion leaves the task snapshot unchanged'
);
select is(
  (select queue_name from pgflow.step_tasks where flow_slug = 'Invoices'),
  'invoices',
  'failure leaves the task snapshot unchanged'
);

-- ============================================================
-- BLOCK 2: SQL-only multi-queue cancellation fixture
-- ============================================================
-- Deliberately malformed internal state (a step routed off the canonical
-- default) to prove cancellation groups keep queue identity. Not an allowed
-- user route; the surrounding transaction and reset_db own cleanup.
select pgflow_tests.reset_db();
select pgflow.create_flow('GroupFixture', max_attempts => 1);
select pgflow.add_step('GroupFixture', 'leftTask');
select pgflow.add_step('GroupFixture', 'rightTask');
select pgmq.create('fixture_other');
update pgflow.steps set queue_name = 'fixture_other'
where flow_slug = 'GroupFixture' and step_slug = 'rightTask';
select pgflow.start_flow('GroupFixture', '{}');

-- An unrelated third queue must stay untouched
select pgflow.create_flow('Bystander', max_attempts => 1);
select pgflow.add_step('Bystander', 'only');
select pgflow.start_flow('Bystander', '{}');

select is(
  (select queue_name from pgflow.step_tasks where step_slug = 'rightTask'),
  'fixture_other',
  'rightTask task snapshots the non-default route'
);

-- Start the culprit through direct test-only task state (the public claim
-- correctly rejects this invalid route)
select pgflow_tests.ensure_worker('groupfixture');
update pgflow.step_tasks
set status = 'started',
    started_at = now(),
    attempts_count = attempts_count + 1,
    last_worker_id = '11111111-1111-1111-1111-111111111111'::uuid
where flow_slug = 'GroupFixture' and step_slug = 'rightTask';

select pgflow.fail_task(
  (select run_id from pgflow.step_tasks where step_slug = 'rightTask'),
  'rightTask',
  0,
  'boom'
);

select is(
  (select count(*)::int from pgmq.a_fixture_other),
  1,
  'failure archives the culprit from its snapshot queue'
);
select is(
  (select count(*)::int from pgmq.a_groupfixture),
  1,
  'cancellation archives the sibling from the canonical snapshot queue'
);
select is(
  (select count(*)::int from pgmq.q_bystander),
  1,
  'a third queue is never touched'
);
select is(
  (select status from pgflow.step_tasks where step_slug = 'leftTask'),
  'cancelled',
  'sibling task is cancelled'
);

-- ============================================================
-- BLOCK 3: NULL message ID follows state cleanup without PGMQ calls
-- ============================================================
select pgflow_tests.reset_db();
select pgflow.create_flow('NullMsg', max_attempts => 1);
select pgflow.add_step('NullMsg', 'first');
select pgflow.start_flow('NullMsg', '{}');
select pgflow_tests.ensure_worker('nullmsg');
update pgflow.step_tasks
set message_id = null,
    status = 'started',
    started_at = now(),
    attempts_count = attempts_count + 1,
    last_worker_id = '11111111-1111-1111-1111-111111111111'::uuid
where flow_slug = 'NullMsg';

select lives_ok(
  $$select pgflow.complete_task(
    (select run_id from pgflow.step_tasks where flow_slug = 'NullMsg'),
    'first', 0, '"done"'::jsonb)$$,
  'a NULL-ID task completes without any PGMQ call'
);
select is(
  (select status from pgflow.step_tasks where flow_slug = 'NullMsg'),
  'completed',
  'NULL-ID task reaches completed'
);
select is(
  (select status from pgflow.runs where flow_slug = 'NullMsg'),
  'completed',
  'the run completes for a NULL-ID task'
);

select finish();
rollback;
