-- Test: a visibility-update failure rolls back the whole claim
-- A batch whose queue is missing (crafted via pgmq.drop_queue) makes
-- set_vt_batch fail inside start_tasks; the single-statement atomicity must
-- roll back every task transition and attempt increment in the batch, and no
-- task may be returned.
begin;
select plan(10);

select pgflow_tests.reset_db();

-- Two root steps = two messages, one queue per flow
select pgflow.create_flow('visfail', null, null, 5);
select pgflow.add_step('visfail', 'root_a');
select pgflow.add_step('visfail', 'root_b');

select pgflow.start_flow('visfail', '"x"'::jsonb);
select pgflow_tests.ensure_worker('visfail');

-- Read both messages (initial PGMQ read visibility), do not start yet
select array_agg(msg_id) as ids into temporary visfail_msgs
from pgmq.read_with_poll('visfail', 30, 2, 1, 100);

select is(
  (select cardinality(ids) from visfail_msgs),
  2,
  'both messages read from the queue'
);

-- Craft the failure: tasks stay queued but their queue table disappears
select pgmq.drop_queue('visfail');

-- start_tasks claims both tasks, then the visibility update fails:
-- the whole statement must roll back
select throws_ok(
  $$ select pgflow.start_tasks(
       'visfail',
       (select ids from visfail_msgs),
       '11111111-1111-1111-1111-111111111111'::uuid
     ) $$,
  'relation "pgmq.q_visfail" does not exist',
  'missing queue table makes start_tasks fail'
);

select is(
  (select count(*)::int from pgflow.step_tasks where status = 'started'),
  0,
  'visibility failure rolls back the task transition for the whole batch'
);

select is(
  (select count(*)::int from pgflow.step_tasks
   where status = 'queued' and attempts_count = 0),
  2,
  'visibility failure rolls back attempt increments for the whole batch'
);

select is(
  (select count(*)::int from pgflow.step_tasks
   where status = 'queued' and started_at is null),
  2,
  'rolled back tasks keep queued shape (no started_at)'
);

-- ==========================================
-- Case 2: PARTIAL visibility failure
-- ==========================================
-- Exactly one of two queue rows is deleted. set_vt_batch updates only the
-- rows it finds, so the updated/claimed mismatch must fail the whole
-- statement (nothing returned) instead of silently returning a task whose
-- visibility update did not execute.
select pgflow_tests.reset_db();

select pgflow.create_flow('vispartial', null, null, 5);
select pgflow.add_step('vispartial', 'root_a');
select pgflow.add_step('vispartial', 'root_b');

select pgflow.start_flow('vispartial', '"x"'::jsonb);
select pgflow_tests.ensure_worker('vispartial');

select array_agg(msg_id) as ids into temporary vispartial_msgs
from pgmq.read_with_poll('vispartial', 30, 2, 1, 100);

select is(
  (select cardinality(ids) from vispartial_msgs),
  2,
  'both messages read from the queue'
);

-- Delete exactly one message row directly from the queue table
delete from pgmq.q_vispartial
where msg_id = (select min(m) from unnest((select ids from vispartial_msgs)) as m);

select throws_ok(
  $$ select pgflow.start_tasks(
       'vispartial',
       (select ids from vispartial_msgs),
       '11111111-1111-1111-1111-111111111111'::uuid
     ) $$,
  'invalid input syntax for type integer: "start_tasks(): visibility updated 1 of 2 claimed messages"',
  'partial visibility mismatch fails the whole statement and returns nothing'
);

select is(
  (select count(*)::int from pgflow.step_tasks where status = 'started'),
  0,
  'partial visibility failure rolls back both task transitions'
);

select is(
  (select count(*)::int from pgflow.step_tasks
   where status = 'queued' and attempts_count = 0),
  2,
  'partial visibility failure leaves attempts_count unchanged (0)'
);

select is(
  (select count(*)::int from pgflow.step_tasks
   where status = 'queued' and started_at is null),
  2,
  'partial visibility failure leaves started_at null'
);

select finish();
rollback;
