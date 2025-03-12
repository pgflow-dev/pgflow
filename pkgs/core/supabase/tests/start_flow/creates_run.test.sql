BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should be created
SELECT results_eq(
    $$ SELECT flow_slug, status, input from pgflow.runs $$,
    $$ VALUES ('sequential', 'started', '"hello"'::jsonb) $$,
    'Run should be created with appropriate status and input'
);

-- TEST: remaining_steps should be equal to number of steps
SELECT is(
    (SELECT remaining_steps::int FROM pgflow.runs LIMIT 1),
    3::int,
    'remaining_steps should be equal to number of steps'
);

SELECT finish();
ROLLBACK;
