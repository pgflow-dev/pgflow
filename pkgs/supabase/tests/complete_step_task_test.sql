BEGIN;
SELECT plan(2);

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

SELECT pgflow.complete_step_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'test_step',
    '"ok"'::jsonb
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
        (SELECT status FROM step_task),
        'completed',
        'calling start_step_task() changes status to "completed"'
    )
UNION ALL
SELECT
    is(
        (SELECT result FROM step_task),
        '"ok"',
        'calling start_step_task() changes result to "ok"'
    );

SELECT finish();
ROLLBACK;
