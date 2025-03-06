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
