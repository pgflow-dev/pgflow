BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');

-- Test
SELECT pgflow.add_step('test_flow', 'first_step');
SELECT results_eq(
    $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' $$,
    ARRAY['first_step']::text[],
    'Step should be added to the steps table'
);
SELECT is_empty(
    $$ SELECT * FROM pgflow.deps WHERE flow_slug = 'test_flow' $$,
    'No dependencies should be added for step with no dependencies'
);

SELECT * FROM finish();
ROLLBACK;
