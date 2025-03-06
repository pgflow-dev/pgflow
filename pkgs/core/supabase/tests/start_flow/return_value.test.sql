BEGIN;
SELECT plan(1);

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

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT DISTINCT status
       FROM pgflow.start_flow('sequential', '"hello"'::jsonb) $$,
    $$ VALUES ('started') $$,
    'start_flow() should return only started step states'
);

SELECT finish();
ROLLBACK;
