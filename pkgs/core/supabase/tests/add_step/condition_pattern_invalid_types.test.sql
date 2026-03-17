\set ON_ERROR_STOP on
\set QUIET on

begin;
select plan(4);
select pgflow_tests.reset_db();

select pgflow.create_flow('invalid_pattern_test');

-- Test 1: required_input_pattern as array should fail
select throws_ok(
  $$ select pgflow.add_step('invalid_pattern_test', 'step_array', required_input_pattern => '[]'::jsonb) $$,
  'new row for relation "steps" violates check constraint "required_input_pattern_is_object"',
  'Should reject array for required_input_pattern'
);

-- Test 2: required_input_pattern as string should fail
select throws_ok(
  $$ select pgflow.add_step('invalid_pattern_test', 'step_string', required_input_pattern => '"invalid"'::jsonb) $$,
  'new row for relation "steps" violates check constraint "required_input_pattern_is_object"',
  'Should reject string for required_input_pattern'
);

-- Test 3: forbidden_input_pattern as array should fail
select throws_ok(
  $$ select pgflow.add_step('invalid_pattern_test', 'step_forbidden_array', forbidden_input_pattern => '[]'::jsonb) $$,
  'new row for relation "steps" violates check constraint "forbidden_input_pattern_is_object"',
  'Should reject array for forbidden_input_pattern'
);

-- Test 4: forbidden_input_pattern as string should fail
select throws_ok(
  $$ select pgflow.add_step('invalid_pattern_test', 'step_forbidden_string', forbidden_input_pattern => '"invalid"'::jsonb) $$,
  'new row for relation "steps" violates check constraint "forbidden_input_pattern_is_object"',
  'Should reject string for forbidden_input_pattern'
);

select finish();
rollback;
