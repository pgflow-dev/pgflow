BEGIN;
SELECT plan(7);

DELETE FROM pgflow.step_states;
DELETE FROM pgflow.runs;
DELETE FROM pgflow.deps;
DELETE FROM pgflow.steps;
DELETE FROM pgflow.flows;

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

-- SETUP: Start a flow run
SELECT pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should be created
SELECT results_eq(
    $$ SELECT flow_slug, status, payload from pgflow.runs $$,
    $$ VALUES ('sequential', 'started', '"hello"'::jsonb) $$,
    'Run should be created with appropriate status and payload'
);

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

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT DISTINCT status
       FROM pgflow.start_flow('sequential', '"hello"'::jsonb) $$,
    $$ VALUES ('started') $$,
    'start_flow() should return only started step states'
);

SELECT finish();
ROLLBACK;
