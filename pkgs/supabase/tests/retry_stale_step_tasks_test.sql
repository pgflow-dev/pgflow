BEGIN;
SELECT plan(4);
SELECT pgflow_tests.mock_call_edgefn();

-- Setup test data
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES
('test_flow', 'stale_step'),
('test_flow', 'not_stale_step'),
('test_flow', 'started_step');

INSERT INTO pgflow.runs (flow_slug, run_id, status, payload)
VALUES ('test_flow', gen_random_uuid(), 'pending', '{}'::jsonb);

WITH run AS (SELECT run_id FROM pgflow.runs LIMIT 1)

INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug)
VALUES
('test_flow', (SELECT run_id FROM run), 'stale_step'),
('test_flow', (SELECT run_id FROM run), 'not_stale_step'),
('test_flow', (SELECT run_id FROM run), 'started_step');

-- Create step tasks in different states
INSERT INTO pgflow.step_tasks (
    flow_slug, run_id, step_slug, status, next_attempt_at, payload
)
VALUES
(
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'stale_step',
    'queued',
    now() - interval '3 seconds',
    '{"stale": true}'::jsonb
),
(
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'not_stale_step',
    'queued',
    now() - interval '1 second',
    '{"fresh": true}'::jsonb
),
(
    'test_flow',
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'started_step',
    'started',
    now() - interval '3 seconds',
    '{"started": true}'::jsonb
);

SELECT pgflow.retry_stale_step_tasks();

-- Check that stale queued tasks were retried
SELECT is(
    (SELECT count(*) FROM pgflow_tests.call_edgefn_calls),
    1::bigint,
    'Only one task should be retried'
);

-- Verify payload matches
SELECT is(
    (SELECT body::jsonb FROM pgflow_tests.call_edgefn_calls LIMIT 1),
    '{"stale": true}'::jsonb,
    'Retried task should have correct payload'
);

-- Fresh tasks should not be retried
SELECT is(
    (
        SELECT count(*)
        FROM pgflow_tests.call_edgefn_calls
        WHERE body = '{"fresh": true}'::jsonb::text
    ),
    0::bigint,
    'Fresh tasks should not be retried'
);

-- Started tasks should not be retried
SELECT is(
    (
        SELECT count(*)
        FROM pgflow_tests.call_edgefn_calls
        WHERE body = '{"started": true}'::jsonb::text
    ),
    0::bigint,
    'Started tasks should not be retried'
);

SELECT finish();
ROLLBACK;
