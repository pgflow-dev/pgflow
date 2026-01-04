begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Create a flow and start it
select pgflow.create_flow('test_constraint');
select pgflow.add_step('test_constraint', 'step1');
select pgflow.start_flow('test_constraint', '{}'::jsonb);

-- Test 1: Output cannot be set on a non-completed step (should fail)
select throws_ok(
  $$
    UPDATE pgflow.step_states
    SET output = '{"test": true}'::jsonb
    WHERE step_slug = 'step1'
  $$,
  '23514',  -- check_violation error code
  'new row for relation "step_states" violates check constraint "output_only_for_completed_or_null"',
  'Cannot set output on non-completed step'
);

-- Test 2: Output can be set when status is completed (should pass)
select lives_ok(
  $$
    UPDATE pgflow.step_states
    SET status = 'completed',
        remaining_tasks = 0,
        started_at = now(),
        completed_at = now(),
        output = '{"test": true}'::jsonb
    WHERE step_slug = 'step1'
  $$,
  'Can set output when status is completed'
);

select * from finish();
rollback;
