BEGIN;
SELECT plan(4);

DELETE FROM pgflow.runs;
DELETE FROM pgflow.deps;
DELETE FROM pgflow.steps;
DELETE FROM pgflow.flows;

-- SETUP: Create flows first
SELECT pgflow.create_flow('sequential');
SELECT pgflow.add_step('sequential', 'first');
SELECT pgflow.add_step('sequential', 'second', ARRAY['first']);
SELECT pgflow.add_step('sequential', 'last', ARRAY['second']);

-- TEST 1: No runs initially
SELECT is_empty(
    $$ select * from pgflow.runs $$,
    'No runs should be created initially'
);

-- TEST 2. No step states initially
SELECT is_empty(
    $$ select * from pgflow.step_states $$,
    'No step states should be created initially'
);

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST 3: Run should be created
SELECT results_eq(
    $$ select flow_slug, status, payload from pgflow.runs $$,
    $$ VALUES ('sequential', 'pending', '"hello"'::jsonb) $$,
    'Run should be created with appropriate status and payload'
);

-- TEST 4: Step states should be created for all steps
SELECT set_eq(
    $$ select flow_slug, step_slug from pgflow.step_states $$,
    $$ VALUES ('sequential', 'first'), ('sequential', 'second'), ('sequential', 'last') $$,
    'Step states should be created for all steps'
);

SELECT finish();
ROLLBACK;
