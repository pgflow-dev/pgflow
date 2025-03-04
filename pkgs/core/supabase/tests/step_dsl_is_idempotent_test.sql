BEGIN;
SELECT plan(2);

DELETE FROM pgflow.deps;
DELETE FROM pgflow.steps;
DELETE FROM pgflow.flows;

-- Create a simple flow first
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'step_one');
SELECT pgflow.add_step('test_flow', 'step_two', ARRAY['step_one']);
SELECT pgflow.add_step('test_flow', 'step_three', ARRAY['step_one', 'step_two']);

-- Run the same flow creation and step addition sequence again to verify those are idempotent
SELECT pgflow.create_flow('test_flow');
SELECT pgflow.add_step('test_flow', 'step_one');
SELECT pgflow.add_step('test_flow', 'step_two', ARRAY['step_one']);
SELECT pgflow.add_step('test_flow', 'step_three', ARRAY['step_one', 'step_two']);

-- Check the state after first sequence
SELECT results_eq(
    $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug $$,
    ARRAY['step_one', 'step_three', 'step_two']::text[],
    'No duplicated steps were created'
);

-- Verify the state hasn't changed
SELECT results_eq(
    $$ SELECT DISTINCT flow_slug FROM pgflow.flows $$,
    ARRAY['test_flow']::text[],
    'No duplicated flows were created'
);

SELECT * FROM finish();
ROLLBACK;
