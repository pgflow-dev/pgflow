-- Test: _cascade_force_skip_steps - Single step skip (base case)
-- Verifies the function can skip a single step without dependencies
begin;
select plan(5);

-- Reset database and create a simple flow with no dependencies
select pgflow_tests.reset_db();
select pgflow.create_flow('simple_flow');
select pgflow.add_step('simple_flow', 'step_a');
select pgflow.add_step('simple_flow', 'step_b');

-- Start flow
with flow as (
  select * from pgflow.start_flow('simple_flow', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: Verify step_a starts in 'started' status (root steps auto-start)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'started',
  'step_a should start in started status (root step auto-starts)'
);

-- Skip step_a
select pgflow._cascade_force_skip_steps(
  (select run_id from run_ids),
  'step_a',
  'condition_unmet'
);

-- Test 2: step_a should now have status 'skipped'
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'skipped',
  'step_a should be skipped after _cascade_force_skip_steps'
);

-- Test 3: step_a should have skip_reason set
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'condition_unmet',
  'step_a should have skip_reason = condition_unmet'
);

-- Test 4: step_b should remain unaffected (still started, independent root step)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'started',
  'step_b (independent step) should remain in started status'
);

-- Test 5: remaining_steps on run should be decremented by 1
select is(
  (select remaining_steps from pgflow.runs
   where run_id = (select run_id from run_ids)),
  1::int,
  'remaining_steps should be decremented by 1 (was 2, now 1)'
);

-- Clean up
drop table if exists run_ids;

select finish();
rollback;
