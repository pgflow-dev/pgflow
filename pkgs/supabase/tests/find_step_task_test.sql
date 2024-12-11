BEGIN;

-- Plan the number of tests
SELECT plan(4);

----- Setup
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES (
    'test_flow', 'test_step'
);
INSERT INTO pgflow.runs (flow_slug, run_id, status, payload) VALUES (
    'test_flow', gen_random_uuid(), 'pending', '{}'::jsonb
);
INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, completed_at, step_result) VALUES (
    'test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'test_step', now(), '{}'::jsonb
);

----- Test that find_run() throws for an invalid run ID
SELECT throws_like(
    $$ SELECT pgflow.find_step_task(gen_random_uuid(), 'test_step') $$,
    '%Step task not found%',
    'find_step_task() throws an error for non-existent run_id'
);

SELECT throws_like(
    $$ SELECT pgflow.find_step_task((select run_id from pgflow.runs limit 1), 'invalid_step') $$,
    '%Step task not found%',
    'find_step_task() throws an error for invalid step slug of a run'
);

SELECT throws_like(
    $$ SELECT pgflow.find_step_task((select run_id from pgflow.runs limit 1), 'test_step') $$,
    '%Step task not found%',
    'find_step_task() throws an error if there are no step_task for given step'
);


INSERT INTO pgflow.step_tasks (flow_slug, run_id, step_slug, payload) VALUES (
    'test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'test_step', '{}'::jsonb
);

--- Test that run_flow() successfully creates a run
SELECT is(
    (
        SELECT status
        FROM pgflow.find_step_task((SELECT run_id FROM pgflow.runs LIMIT 1), 'test_step')
    ),
    'queued',
    'find_step_task() returns a queued step task'
);

----- Finish the test
SELECT finish();

ROLLBACK;
