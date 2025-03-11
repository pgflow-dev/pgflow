BEGIN;
SELECT plan(1);
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

SELECT finish();
ROLLBACK;
