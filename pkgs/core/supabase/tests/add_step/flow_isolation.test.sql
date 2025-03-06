BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'first_step');
SELECT pgflow.create_flow('another_flow');

-- Test
SELECT pgflow.add_step('another_flow', 'first_step');
SELECT pgflow.add_step('another_flow', 'another_step', ARRAY['first_step']);
SELECT set_eq(
    $$
      SELECT flow_slug, step_slug
      FROM pgflow.steps WHERE flow_slug = 'another_flow'
    $$,
    $$ VALUES
       ('another_flow', 'another_step'),
       ('another_flow', 'first_step')
    $$,
    'Steps in second flow should be isolated from first flow'
);

SELECT * FROM finish();
ROLLBACK;
