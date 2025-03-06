BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');

-- Test
SELECT throws_ok(
    $$ SELECT pgflow.add_step('test_flow', '1invalid-slug') $$,
    'new row for relation "steps" violates check constraint "steps_step_slug_check"',
    'Should detect and prevent invalid step slug'
);

SELECT * FROM finish();
ROLLBACK;

