BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');
SELECT pgflow_tests.setup_flow('sequential_other');

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: All step states from flow should be created
SELECT set_eq(
    $$ SELECT step_slug
       FROM pgflow.step_states WHERE flow_slug = 'sequential' $$,
    ARRAY['first', 'second', 'last']::text[],
    'All step states from flow should be created'
);

-- TEST: No steps from other flows should be created
SELECT is_empty(
    $$ SELECT * FROM pgflow.step_states WHERE flow_slug <> 'sequential' $$,
    'No steps from other flows should be created'
);

SELECT finish();
ROLLBACK;
