BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- TEST: Should detect and prevent invalid flow slug
SELECT throws_ok(
    $$ SELECT pgflow.create_flow('invalid-flow') $$,
    'new row for relation "flows" violates check constraint "flows_flow_slug_check"',
    'Should detect and prevent invalid flow slug'
);

SELECT * FROM finish();
ROLLBACK;
