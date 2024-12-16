BEGIN;
SELECT plan(3);
SELECT pgflow_tests.mock_call_edgefn();

------------------------------ SETUP ------------------------------------------
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug)
VALUES 
    ('test_flow', 'failed_step'), 
    ('test_flow', 'completed_step'),
    ('test_flow', 'queued_step');
INSERT INTO pgflow.runs (flow_slug, run_id, status, payload) VALUES (
    'test_flow', gen_random_uuid(), 'pending', '{}'::jsonb
);
INSERT INTO pgflow.step_states (
    flow_slug, run_id, step_slug, step_result
) VALUES
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'failed_step', '{}'::jsonb),
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'completed_step', '{}'::jsonb),
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'queued_step', '{}'::jsonb);

INSERT INTO pgflow.step_tasks (
    flow_slug, run_id, step_slug, payload, status
) VALUES
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'completed_step', '{}'::jsonb, 'completed'),
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'failed_step', '{}'::jsonb, 'failed'),
    ('test_flow', (SELECT run_id FROM pgflow.runs LIMIT 1), 'queued_step', '{}'::jsonb, 'queued');

-------------------------------------------------------------------------------
--------- Calling retry on completed step raises an error ---------------------
-------------------------------------------------------------------------------
SELECT throws_like(
    $$ SELECT pgflow.retry_step_task((SELECT run_id FROM pgflow.runs LIMIT 1), 'completed_step') $$,
    'Expected step_tasks status to be one of {failed,queued} but got ''completed'''
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
    'failed task is retried and attempt_count is incremented'
);

-------------------------------------------------------------------------------
--------- Calling retry on queued step enqueues task again --------------------
-------------------------------------------------------------------------------
SELECT pgflow.retry_step_task((SELECT run_id FROM pgflow.runs LIMIT 1), 'queued_step');

SELECT is(
    (
        SELECT attempt_count
        FROM pgflow.step_tasks
        WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
        AND step_slug = 'queued_step'
    ),
    2::integer,
    'queued task is retried and attempt_count is incremented'
);

SELECT finish();
ROLLBACK;
