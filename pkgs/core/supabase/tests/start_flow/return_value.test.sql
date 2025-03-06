BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT DISTINCT status
       FROM pgflow.start_flow('sequential', '"hello"'::jsonb) $$,
    $$ VALUES ('started') $$,
    'start_flow() should return only started step states'
);

SELECT finish();
ROLLBACK;
