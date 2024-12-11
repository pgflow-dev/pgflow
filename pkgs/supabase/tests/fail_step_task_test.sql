BEGIN;
SELECT plan(9);
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
    flow_slug, run_id, step_slug, payload, status
)
VALUES (
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '{}'::jsonb,
    'started'
);

-------------------------------------------------------------------------------
---------- First attempt ------------------------------------------------------
-------------------------------------------------------------------------------
SELECT pgflow.fail_step_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '"1st-error"'::jsonb
);

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
        2::integer,
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


-------------------------------------------------------------------------------
---------- Second attempt -----------------------------------------------------
-------------------------------------------------------------------------------

-- Set status back to started to simulate task being picked up for retry
UPDATE pgflow.step_tasks
SET status = 'started'
WHERE
    run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
    AND step_slug = 'test_step';

SELECT pgflow.fail_step_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '"2nd-error"'::jsonb
);

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
        'calling fail_step_task() makes another retry attempt'
    )
UNION ALL
SELECT
    is(
        (SELECT result FROM step_task),
        '"2nd-error"',
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

-------------------------------------------------------------------------------
---------- Last attempt -------------------------------------------------------
-------------------------------------------------------------------------------

-- Set status back to started to simulate task being picked up for retry
UPDATE pgflow.step_tasks
SET status = 'started'
WHERE
    run_id = (SELECT run_id FROM pgflow.runs LIMIT 1)
    AND step_slug = 'test_step';

SELECT pgflow.fail_step_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '"last-error"'::jsonb
);

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
        'calling fail_step_task() makes another retry attempt'
    )
UNION ALL
SELECT
    is(
        (SELECT result FROM step_task),
        '"last-error"',
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
        'failed',
        'Fails the Step completely because retries are exhausted'
    );

SELECT finish();
ROLLBACK;
