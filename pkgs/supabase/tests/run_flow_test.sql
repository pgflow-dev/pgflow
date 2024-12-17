BEGIN;
SELECT plan(11);

-------------------------
------- SETUP -----------
SELECT pgflow_tests.mock_call_edgefn();

INSERT INTO pgflow.flows (flow_slug) VALUES ('flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('flow', 'root_a'),
('flow', 'root_b'),
('flow', 'dependant');
INSERT INTO pgflow.deps (flow_slug, from_step_slug, to_step_slug)
VALUES ('flow', 'root_a', 'dependant'), ('flow', 'root_b', 'dependant');

-------------------------
------- TESTS -----------

SELECT run_id INTO TEMP TABLE test_run
FROM pgflow.run_flow('flow', '"run_payload"'::jsonb);

SELECT isnt_empty('SELECT * FROM test_run', 'Run successfully created');

SELECT throws_ok(
    $$ SELECT pgflow.run_flow('invalid-slug', '"run_payload"'::jsonb) $$
);

-- Test for flow with no steps
INSERT INTO pgflow.flows (flow_slug) VALUES ('empty_flow');
SELECT throws_like(
    $$ SELECT pgflow.run_flow('empty_flow', '"run_payload"'::jsonb) $$,
    'Flow empty_flow has no root steps defined',
    'run_flow raises exception for flow with no steps'
);

SELECT is(
    (
        SELECT array_agg(step_slug)
        FROM pgflow.step_states
        WHERE run_id = (SELECT run_id FROM test_run)
    ),
    ARRAY['root_a', 'root_b'],
    'Root steps are started with the flow'
);

SELECT ok(
    NOT EXISTS (
        SELECT status
        FROM pgflow.step_states
        WHERE
            run_id = (SELECT run_id FROM test_run)
            AND step_slug = 'dependant'
    ),
    'Dependant step is not started'
);

-- Verify run status is set to 'pending'
SELECT is(
    (
        SELECT status
        FROM pgflow.runs
        WHERE run_id = (SELECT run_id FROM test_run)
    ),
    'pending',
    'New run should have pending status'
);

-- Verify root step states are set to pending
SELECT is(
    (
        SELECT array_agg(DISTINCT status)
        FROM pgflow.step_states
        WHERE run_id = (SELECT run_id FROM test_run)
    ),
    ARRAY['pending'],
    'All root steps should be in pending status'
);

-- Verify payload is stored correctly
SELECT is(
    (
        SELECT payload
        FROM pgflow.runs
        WHERE run_id = (SELECT run_id FROM test_run)
    ),
    '"run_payload"'::jsonb,
    'Payload should be stored exactly as provided'
);

-- Verify run_id is unique per call
WITH run1 AS (
    SELECT run_id FROM pgflow.run_flow('flow', '"payload1"'::jsonb)
),

run2 AS (
    SELECT run_id FROM pgflow.run_flow('flow', '"payload2"'::jsonb)
)

SELECT ok(
    (SELECT run_id FROM run1) != (SELECT run_id FROM run2),
    'Each run should get a unique run_id'
);

-- Verify flow_slug is case sensitive
INSERT INTO pgflow.flows (flow_slug) VALUES ('FLOW_UPPER');
SELECT throws_like(
    $$ SELECT pgflow.run_flow('flow_upper', '{}'::jsonb) $$,
    '%insert or update on table "runs" violates foreign key constraint "runs_flow_slug_fkey%',
    'flow_upper does not exist because flow_slug is case sensitive'
);

-- Verify complex JSONB payload
SELECT lives_ok(
    $$ SELECT pgflow.run_flow('flow', '{"array": [1,2,3], "nested": {"key": "value"}}'::jsonb) $$,
    'run_flow accepts complex JSONB payload'
);

SELECT finish();
ROLLBACK;
