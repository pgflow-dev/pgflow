BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- SETUP: Create flows first
SELECT pgflow.create_flow('sequential');
SELECT pgflow.add_step('sequential', 'first');
SELECT pgflow.add_step('sequential', 'second', ARRAY['first']);
SELECT pgflow.add_step('sequential', 'last', ARRAY['second']);

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should be created
SELECT results_eq(
    $$ SELECT flow_slug, status, payload from pgflow.runs $$,
    $$ VALUES ('sequential', 'started', '"hello"'::jsonb) $$,
    'Run should be created with appropriate status and payload'
);

SELECT finish();
ROLLBACK;
