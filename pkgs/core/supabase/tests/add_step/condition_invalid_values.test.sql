-- Test: add_step - Invalid condition parameter values
-- Verifies CHECK constraints reject invalid when_unmet and when_exhausted values
begin;
select plan(2);

select pgflow_tests.reset_db();
select pgflow.create_flow('invalid_test');

-- Test 1: Invalid when_unmet value should fail
select throws_ok(
  $$ SELECT pgflow.add_step('invalid_test', 'bad_step', when_unmet => 'invalid_value') $$,
  'new row for relation "steps" violates check constraint "when_unmet_is_valid"',
  'Invalid when_unmet value should be rejected'
);

-- Test 2: Invalid when_exhausted value should fail
select throws_ok(
  $$ SELECT pgflow.add_step('invalid_test', 'bad_step2', when_exhausted => 'invalid_value') $$,
  'new row for relation "steps" violates check constraint "when_exhausted_is_valid"',
  'Invalid when_exhausted value should be rejected'
);

select finish();
rollback;
