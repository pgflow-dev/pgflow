BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');
SELECT pgflow_tests.setup_flow('sequential_other');

-- TEST: No runs initially
SELECT is_empty(
    $$ select * from pgflow.runs $$,
    'No runs should be created initially'
);

-- TEST: No step states initially
SELECT is_empty(
    $$ select * from pgflow.step_states $$,
    'No step states should be created initially'
);

SELECT finish();
ROLLBACK;
