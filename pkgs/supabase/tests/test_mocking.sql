BEGIN;

-- Plan the number of tests
SELECT plan(1);

----- Setup
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES (
    'test_flow', 'test_step'
);

SELECT pgflow_tests.mock_call_edgefn();

SELECT pgflow.call_edgefn('fn_name', 'fn_body');

-- First verify count
SELECT is(
    (
        SELECT count(*)
        FROM pgflow_tests.call_edgefn_calls
        WHERE
            function_name = 'fn_name'
            AND body = 'fn_body'
    ),
    1::BIGINT,
    'call_edgefn was called exactly once'
);

SELECT finish();

ROLLBACK;
