BEGIN;
SELECT plan(2);
SELECT pgflow_tests.mock_call_edgefn();

------------------------------ SETUP ------------------------------------------
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug)
VALUES ('test_flow', 'failed_step'), ('test_flow', 'completed_step');
INSERT INTO pgflow.runs (flow_slug, run_id, status, payload) VALUES (
    'test_flow', gen_random_uuid(), 'pending', '{}'::jsonb
);
INSERT INTO pgflow.step_states (
    flow_slug, run_id, step_slug, step_result
) VALUES 
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'failed_step', '{}'::jsonb),
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'completed_step', '{}'::jsonb);

INSERT INTO pgflow.step_tasks (
    flow_slug, run_id, step_slug, payload, status
) VALUES 
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'completed_step', '{}'::jsonb, 'completed'),
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'failed_step', '{}'::jsonb, 'failed');

-------------------------------------------------------------------------------
--------- Calling retry on completed step raises an error ---------------------
-------------------------------------------------------------------------------
SELECT throws_like(
    $$ SELECT pgflow.retry_step_task((SELECT run_id FROM pgflow.runs LIMIT 1), 'completed_step') $$,
    '%Step task is not "failed", but "completed" instead%'
);

-------------------------------------------------------------------------------
--------- Calling retry on failed step enqueues task again --------------------
-------------------------------------------------------------------------------
SELECT pgflow.retry_step_task((SELECT run_id FROM pgflow.runs LIMIT 1), 'failed_step');

SELECT is(
    (
        SELECT attempt_count
        FROM pgflow.step_tasks
        WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
        AND step_slug = 'failed_step'
    ),
    2::integer,
    'task is retried and attempt_count is incremented'
);

SELECT finish();
ROLLBACK;
