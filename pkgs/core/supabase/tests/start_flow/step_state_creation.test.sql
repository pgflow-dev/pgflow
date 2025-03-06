BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();

-- SETUP: Create flows first
SELECT pgflow.create_flow('sequential');
SELECT pgflow.add_step('sequential', 'first');
SELECT pgflow.add_step('sequential', 'second', ARRAY['first']);
SELECT pgflow.add_step('sequential', 'last', ARRAY['second']);

-- SETUP: Create 2nd flow so we can verify that start_flow()
--        is scoped to the flow_slug provided
SELECT pgflow.create_flow('other');
SELECT pgflow.add_step('other', 'first');
SELECT pgflow.add_step('other', 'second', ARRAY['first']);
SELECT pgflow.add_step('other', 'last', ARRAY['second']);

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: All step states from flow should be created
SELECT results_eq(
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
