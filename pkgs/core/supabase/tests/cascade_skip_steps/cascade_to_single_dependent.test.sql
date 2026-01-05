-- Test: cascade_skip_steps - Cascade to single dependent
-- Verifies skipping a step cascades to its direct dependent
begin;
select plan(7);

-- Reset database and create a flow: A -> B
select pgflow_tests.reset_db();
select pgflow.create_flow('cascade_flow');
select pgflow.add_step('cascade_flow', 'step_a');
select pgflow.add_step('cascade_flow', 'step_b', ARRAY['step_a']);

-- Start flow
with flow as (
  select * from pgflow.start_flow('cascade_flow', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Skip step_a (should cascade to step_b)
select pgflow.cascade_skip_steps(
  (select run_id from run_ids),
  'step_a',
  'condition_unmet'
);

-- Test 1: step_a should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'skipped',
  'step_a should be skipped'
);

-- Test 2: step_a should have skip_reason = condition_unmet
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'condition_unmet',
  'step_a skip_reason should be condition_unmet'
);

-- Test 3: step_b should also be skipped (cascade)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'skipped',
  'step_b should be skipped due to cascade'
);

-- Test 4: step_b should have skip_reason = dependency_skipped
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'dependency_skipped',
  'step_b skip_reason should be dependency_skipped'
);

-- Test 5: Both steps should have skipped_at timestamp set
select ok(
  (select count(*) = 2 from pgflow.step_states
   where run_id = (select run_id from run_ids)
     and skipped_at is not null),
  'Both steps should have skipped_at timestamp'
);

-- Test 6: remaining_steps should be 0 (both skipped)
select is(
  (select remaining_steps from pgflow.runs
   where run_id = (select run_id from run_ids)),
  0::int,
  'remaining_steps should be 0 (both steps skipped)'
);

-- Test 7: step:skipped events should be sent for both steps
select is(
  (select count(*) from realtime.messages
   where payload->>'event_type' = 'step:skipped'
     and payload->>'run_id' = (select run_id::text from run_ids)),
  2::bigint,
  'Should send step:skipped events for both steps'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
