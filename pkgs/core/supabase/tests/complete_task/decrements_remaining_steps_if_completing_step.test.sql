BEGIN;
SELECT plan(4);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- Start the flow
SELECT pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- TEST: Initial remaining_steps should be 3
SELECT is(
    (SELECT remaining_steps::int FROM pgflow.runs LIMIT 1),
    3::int,
    'Initial remaining_steps should be 3'
);

-- Complete the first step's task
SELECT pgflow.complete_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'first',
    0,
    '{"result": "success"}'::JSONB
);

-- TEST: After completing first step, remaining_steps should be 2
SELECT is(
    (SELECT remaining_steps::int FROM pgflow.runs LIMIT 1),
    2::int,
    'After completing first step, remaining_steps should be 2'
);

-- Complete the second step's task
SELECT pgflow.complete_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'second',
    0,
    '{"result": "success"}'::JSONB
);

-- TEST: After completing second step, remaining_steps should be 1
SELECT is(
    (SELECT remaining_steps::int FROM pgflow.runs LIMIT 1),
    1::int,
    'After completing second step, remaining_steps should be 1'
);

-- Complete the last step's task
SELECT pgflow.complete_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'last',
    0,
    '{"result": "success"}'::JSONB
);

-- TEST: Final remaining_steps should be 0
SELECT is(
    (SELECT remaining_steps::int FROM pgflow.runs LIMIT 1),
    0::int,
    'Final remaining_steps should be 0'
);

SELECT finish();
ROLLBACK;
