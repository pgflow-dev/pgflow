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

-- TEST: No runs initially
SELECT is_empty(
    $$ select * from pgflow.runs $$,
    'No runs should be created initially'
);

-- TEST: No step states initially
SELECT is_empty(
    $$ select * from pgflow.step_states $$,
    'No step states should be created initially'
);

SELECT finish();
ROLLBACK;
