BEGIN;

-- Plan the number of tests
SELECT plan(2);

----- Setup
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES (
    'test_flow', 'test_step'
);

SELECT pgflow_tests.mock_start_step();

SELECT pgflow.run_flow('test_flow', '{}'::JSONB);

-- First verify count
SELECT is(
    (SELECT count(*) FROM pgflow_tests.start_step_calls),
    1::BIGINT,
    'start_step was called exactly once'
);

-- Then verify parameters
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pgflow_tests.start_step_calls m
        JOIN pgflow.runs r ON r.run_id = m.run_id
        WHERE m.step_slug = 'test_step'
    ),
    'start_step was called with correct parameters'
);

SELECT finish();

ROLLBACK;
