BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');

-- Test
SELECT throws_ok(
    $$ SELECT pgflow.add_step('test_flow', 'invalid_dep_step', ARRAY['nonexistent_step']) $$,
    'insert or update on table "deps" violates foreign key constraint "deps_flow_slug_dep_slug_fkey"',
    'Should detect and prevent dependency on non-existent step'
);

SELECT * FROM finish();
ROLLBACK;

