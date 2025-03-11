BEGIN;
SELECT plan(3);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'first_step');

-- Test
SELECT pgflow.add_step('test_flow', 'second_step', ARRAY['first_step']);
SELECT results_eq(
    $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug $$,
    ARRAY['first_step', 'second_step']::text[],
    'Second step should be added to the steps table'
);
SELECT is(
    (SELECT deps_count::int FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'second_step'),
    1::int,
    'deps_count should be 1 because "second_step" has one dependency'
);
SELECT results_eq(
    $$
      SELECT dep_slug, step_slug
      FROM pgflow.deps WHERE flow_slug = 'test_flow'
      ORDER BY dep_slug, step_slug
    $$,
    $$ VALUES ('first_step', 'second_step') $$,
    'Dependency should be recorded in deps table'
);

SELECT * FROM finish();
ROLLBACK;
