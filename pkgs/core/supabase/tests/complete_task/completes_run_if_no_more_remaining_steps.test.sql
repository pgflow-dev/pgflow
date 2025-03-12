BEGIN;
SELECT plan(4);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- Start the flow
SELECT pgflow.start_flow('sequential', '{"test": true}'::JSONB);

-- TEST: Initial remaining_steps should be 3 and status should be 'started'
SELECT results_eq(
    $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
    $$ VALUES (3::int, 'started'::text) $$,
    'Initial remaining_steps should be 3 and status should be started'
);

-- Complete the first step's task
SELECT pgflow.complete_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'first',
    0,
    '"first was successful"'::JSONB
);

-- TEST: After completing first step, remaining_steps should be 2 and status still 'started'
SELECT results_eq(
    $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
    $$ VALUES (2::int, 'started'::text) $$,
    'After completing first step, remaining_steps should be 2 and status still started'
);

-- Complete the second step's task
SELECT pgflow.complete_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'second',
    0,
    '"second was successful"'::JSONB
);

-- TEST: After completing second step, remaining_steps should be 1 and status still 'started'
SELECT results_eq(
    $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
    $$ VALUES (1::int, 'started'::text) $$,
    'After completing second step, remaining_steps should be 1 and status still started'
);

-- Complete the last step's task
SELECT pgflow.complete_task(
    (SELECT run_id FROM pgflow.runs LIMIT 1),
    'last',
    0,
    '"last was successful"'::JSONB
);

-- TEST: Final remaining_steps should be 0 and status should be 'completed'
SELECT results_eq(
    $$ SELECT remaining_steps::int, status FROM pgflow.runs LIMIT 1 $$,
    $$ VALUES (0::int, 'completed'::text) $$,
    'Final remaining_steps should be 0 and status should be completed'
);

SELECT finish();
ROLLBACK;
