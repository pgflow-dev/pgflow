-- Test: start_tasks extends PGMQ visibility before returning claimed tasks
-- Effective visibility delay: coalesce(step.opt_timeout, flow.opt_timeout) + 2
-- The queue-table vt must reflect the claim-time extension, not the initial read vt.
begin;
select plan(6);

select pgflow_tests.reset_db();

-- ==========================================
-- Case 1: shorter step timeout overrides flow timeout
-- ==========================================
select pgflow.create_flow('vt_step_short', null, null, 60);
select pgflow.add_step('vt_step_short', 'step_a', timeout => 10);

select pgflow.start_flow('vt_step_short', '"x"'::jsonb);
select pgflow_tests.ensure_worker('vt_step_short');
select pgflow_tests.read_and_start('vt_step_short', 30, 1);

-- Expected vt delay: 10 (step) + 2 = 12
select ok(
  (select abs(extract(epoch from (q.vt - clock_timestamp()))::int - 12) <= 2
   from pgmq.q_vt_step_short q
   join pgflow.step_tasks st on st.message_id = q.msg_id
   where st.flow_slug = 'vt_step_short'),
  'step 10 / flow 60: claimed message vt uses step timeout + 2 (12s)'
);

-- ==========================================
-- Case 2: longer step timeout is not shortened to flow timeout
-- ==========================================
select pgflow.create_flow('vt_step_long', null, null, 5);
select pgflow.add_step('vt_step_long', 'step_a', timeout => 90);

select pgflow.start_flow('vt_step_long', '"x"'::jsonb);
select pgflow_tests.ensure_worker('vt_step_long');
select pgflow_tests.read_and_start('vt_step_long', 30, 1);

-- Expected vt delay: 90 (step) + 2 = 92
select ok(
  (select abs(extract(epoch from (q.vt - clock_timestamp()))::int - 92) <= 2
   from pgmq.q_vt_step_long q
   join pgflow.step_tasks st on st.message_id = q.msg_id
   where st.flow_slug = 'vt_step_long'),
  'step 90 / flow 5: claimed message vt keeps step timeout + 2 (92s)'
);

-- ==========================================
-- Case 3: null step timeout falls back to flow timeout
-- ==========================================
select pgflow.create_flow('vt_step_null', null, null, 7);
select pgflow.add_step('vt_step_null', 'step_a');

select pgflow.start_flow('vt_step_null', '"x"'::jsonb);
select pgflow_tests.ensure_worker('vt_step_null');
select pgflow_tests.read_and_start('vt_step_null', 30, 1);

-- Expected vt delay: 7 (flow fallback) + 2 = 9
select ok(
  (select abs(extract(epoch from (q.vt - clock_timestamp()))::int - 9) <= 2
   from pgmq.q_vt_step_null q
   join pgflow.step_tasks st on st.message_id = q.msg_id
   where st.flow_slug = 'vt_step_null'),
  'null step timeout: claimed message vt uses flow timeout + 2 (9s)'
);

-- ==========================================
-- Case 4: visibility is extended before start_tasks returns (returned task row)
-- ==========================================
select pgflow.create_flow('vt_formula', null, null, 60);
select pgflow.add_step('vt_formula', 'step_a', timeout => 5);

select pgflow.start_flow('vt_formula', '"x"'::jsonb);
select pgflow_tests.ensure_worker('vt_formula');

-- Claim via start_tasks directly; the vt check runs against the returned row's message
select msg_id into temporary vt_formula_msg from pgmq.read_with_poll('vt_formula', 1, 1, 1, 100);

with started as (
  select * from pgflow.start_tasks(
    'vt_formula',
    (select array_agg(msg_id) from vt_formula_msg),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select count(*)::int from started),
  1,
  'claimed task is returned'
);

select is(
  (select status from pgflow.step_tasks where flow_slug = 'vt_formula'),
  'started',
  'task is started'
);

-- Expected vt delay: 5 (step) + 2 = 7, already applied to the queue row
select ok(
  (select abs(extract(epoch from (q.vt - clock_timestamp()))::int - 7) <= 2
   from pgmq.q_vt_formula q
   join pgflow.step_tasks st on st.message_id = q.msg_id
   where st.flow_slug = 'vt_formula'),
  'vt extension is applied before start_tasks returns (step 5 + 2 = 7s)'
);

select finish();
rollback;
