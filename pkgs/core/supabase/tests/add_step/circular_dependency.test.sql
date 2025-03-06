BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'first_step');
SELECT pgflow.add_step('test_flow', 'second_step', ARRAY['first_step']);
SELECT pgflow.add_step('test_flow', 'third_step', ARRAY['second_step']);
SELECT pgflow.add_step('test_flow', 'fourth_step', ARRAY['second_step', 'third_step']);

-- Test
SELECT throws_ok(
    $$ SELECT pgflow.add_step('test_flow', 'circular_step', ARRAY['fourth_step', 'circular_step']) $$,
    'new row for relation "deps" violates check constraint "deps_check"',
    'Should not allow self-depending steps'
);

SELECT * FROM finish();
ROLLBACK;

