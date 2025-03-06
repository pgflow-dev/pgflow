BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Only root steps should be started
--       (Root steps are steps with no dependencies)
SELECT results_eq(
    $$ SELECT step_slug
       FROM pgflow.step_states
       WHERE flow_slug = 'sequential'
       AND status = 'started' $$,
    $$ VALUES ('first') $$,
    'Only root steps should be started'
);

SELECT finish();
ROLLBACK;
