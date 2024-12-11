BEGIN;
SELECT plan(5);

INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES (
    'test_flow', 'test_step'
);
INSERT INTO pgflow.runs (flow_slug, run_id, status, payload) VALUES (
    'test_flow', gen_random_uuid(), 'pending', '{}'::jsonb
);
INSERT INTO pgflow.step_states (
    flow_slug, run_id, step_slug, completed_at, step_result
) VALUES (
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    now(),
    '{}'::jsonb
);
INSERT INTO pgflow.step_tasks (
    flow_slug, run_id, step_slug, payload
)
VALUES (
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '{}'::jsonb
);

SELECT is(
    (
        SELECT status
        FROM
            pgflow.find_step_task(
                (SELECT run_id FROM pgflow.runs LIMIT 1), 'test_step'
            )
    ),
    'queued',
    'start_step_task() returns a queued step task'
);

SELECT pgflow.start_step_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step'
);

SELECT is(
    (
        SELECT status
        FROM
            pgflow.find_step_task(
                (SELECT run_id FROM pgflow.runs LIMIT 1), 'test_step'
            )
    ),
    'started',
    'calling start_step_task() changes status to "started"'
);

-- Test 3: Should fail when run doesn't exist
SELECT throws_like(
    $$ SELECT pgflow.start_step_task(gen_random_uuid(), 'test_step') $$,
    'Run not found%',
    'start_step_task fails when run does not exist'
);

-- Test 4: Should fail when task doesn't exist
SELECT throws_like(
    $$ SELECT pgflow.start_step_task((SELECT run_id FROM pgflow.runs LIMIT 1), 'nonexistent_step') $$,
    'Step task not found%',
    'start_step_task fails when task does not exist'
);

-- Test 5: Should update last_attempt_at and clear next_attempt_at
WITH task_times AS (
    SELECT
        last_attempt_at,
        next_attempt_at
    FROM pgflow.step_tasks
    WHERE run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
    AND step_slug = 'test_step'
)
SELECT ok(
    last_attempt_at > (now() - interval '1 minute')
    AND next_attempt_at IS NULL,
    'start_step_task updates timestamps correctly'
)
FROM task_times;

SELECT finish();
ROLLBACK;
