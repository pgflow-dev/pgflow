BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'first_step');

-- Test
SELECT pgflow.add_step('test_flow', 'first_step');
SELECT results_eq(
    $$
      SELECT count(*)::int FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'first_step'
    $$,
    ARRAY[1]::int[],
    'Calling add_step again for same step does not create a duplicate'
);

SELECT * FROM finish();
ROLLBACK;
