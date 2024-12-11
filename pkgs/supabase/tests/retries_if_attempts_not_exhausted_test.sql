BEGIN;
SELECT plan(3);
SELECT pgflow_tests.mock_call_edgefn();

INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES (
    'test_flow', 'test_step'
);
INSERT INTO pgflow.runs (flow_slug, run_id, status, payload) VALUES (
    'test_flow', gen_random_uuid(), 'pending', '{}'::jsonb
);
INSERT INTO pgflow.step_states (
    flow_slug, run_id, step_slug, step_result
) VALUES (
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '{}'::jsonb
);
INSERT INTO pgflow.step_tasks (
    flow_slug, run_id, step_slug, payload, status, attempt_count, max_attempts
)
VALUES (
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '{}'::jsonb,
    'started',
    2,
    3
);

SELECT pgflow.fail_step_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '"1st-error"'::jsonb
);

-------------------------------------------------------------------------------
---------- Will schedule a retry ----------------------------------------------
-------------------------------------------------------------------------------
WITH step_task AS (
    SELECT *
    FROM
        pgflow.find_step_task(
            (SELECT run_id FROM pgflow.runs LIMIT 1), 'test_step'
        )
)

SELECT
    is(
        (SELECT attempt_count FROM step_task),
        3::integer,
        'calling fail_step_task() makes a retry attempt'
    )
UNION ALL
SELECT
    is(
        (SELECT result FROM step_task),
        '"1st-error"',
        'updates result with error'
    )
UNION ALL
SELECT
    is(
        (
            SELECT status
            FROM
                pgflow.find_step_state(
                    (SELECT run_id FROM step_task), 'test_step'
                )
        ),
        'pending',
        'Step state is still pending until retries are exhausted'
    );

SELECT finish();
ROLLBACK;
