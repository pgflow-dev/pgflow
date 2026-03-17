-- Test: _cascade_force_skip_steps - Cascade through multiple DAG levels
-- Verifies skipping A cascades through A -> B -> C chain
begin;
select plan(8);

-- Reset database and create a flow: A -> B -> C
select pgflow_tests.reset_db();
select pgflow.create_flow('deep_cascade');
select pgflow.add_step('deep_cascade', 'step_a');
select pgflow.add_step('deep_cascade', 'step_b', ARRAY['step_a']);
select pgflow.add_step('deep_cascade', 'step_c', ARRAY['step_b']);

-- Start flow
with flow as (
  select * from pgflow.start_flow('deep_cascade', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Skip step_a (should cascade to step_b and step_c)
select pgflow._cascade_force_skip_steps(
  (select run_id from run_ids),
  'step_a',
  'handler_failed'
);

-- Test 1: step_a should be skipped with handler_failed reason
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'handler_failed',
  'step_a skip_reason should be handler_failed'
);

-- Test 2: step_b should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'skipped',
  'step_b should be skipped (direct dependent of step_a)'
);

-- Test 3: step_b should have dependency_skipped reason
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'dependency_skipped',
  'step_b skip_reason should be dependency_skipped'
);

-- Test 4: step_c should also be skipped (transitive)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  'skipped',
  'step_c should be skipped (transitive cascade)'
);

-- Test 5: step_c should have dependency_skipped reason
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  'dependency_skipped',
  'step_c skip_reason should be dependency_skipped'
);

-- Test 6: All three steps should be skipped
select is(
  (select count(*) from pgflow.step_states
   where run_id = (select run_id from run_ids) and status = 'skipped'),
  3::bigint,
  'All 3 steps should be skipped'
);

-- Test 7: remaining_steps should be 0
select is(
  (select remaining_steps from pgflow.runs
   where run_id = (select run_id from run_ids)),
  0::int,
  'remaining_steps should be 0'
);

-- Test 8: step:skipped events should be sent for all 3 steps
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:skipped'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  3::bigint,
  'Should send 3 step:skipped events'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
