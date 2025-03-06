BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- Test
SELECT throws_ok(
    $$ SELECT pgflow.add_step('nonexistent_flow', 'some_step') $$,
    'insert or update on table "steps" violates foreign key constraint "steps_flow_slug_fkey"',
    'Should not allow adding step to non-existent flow'
);

SELECT * FROM finish();
ROLLBACK;
