BEGIN;
SELECT plan(3);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'first_step');
SELECT pgflow.add_step('test_flow', 'second_step', ARRAY['first_step']);

-- Test
SELECT pgflow.add_step('test_flow', 'third_step', ARRAY['second_step']);
SELECT
    pgflow.add_step('test_flow', 'fourth_step', ARRAY['second_step', 'third_step']);
SELECT results_eq(
    $$
      SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug
    $$,
    ARRAY['first_step', 'fourth_step', 'second_step', 'third_step']::text[],
    'All steps should be in the steps table'
);
SELECT is(
    (
      SELECT deps_count::int
      FROM pgflow.steps
      WHERE flow_slug = 'test_flow' AND step_slug = 'fourth_step'
    ),
    2::int,
    'deps_count should be 2 because "fourth_step" have two dependencies'
);
SELECT set_eq(
    $$
      SELECT dep_slug, step_slug
      FROM pgflow.deps
      WHERE flow_slug = 'test_flow'
    $$,
    $$ VALUES
       ('first_step', 'second_step'),
       ('second_step', 'third_step'),
       ('second_step', 'fourth_step'),
       ('third_step', 'fourth_step')
    $$,
    'All dependencies should be correctly recorded'
);

SELECT * FROM finish();
ROLLBACK;
