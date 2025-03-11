BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');
SELECT pgflow_tests.setup_flow('two_roots');

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT flow_slug, status, input
       FROM pgflow.start_flow('sequential', '"hello"'::jsonb) $$,
    $$ VALUES ('sequential', 'started', '"hello"'::jsonb) $$,
    'start_flow() should return a run'
);

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT flow_slug, status, input
       FROM pgflow.start_flow('sequential', '"world"'::jsonb) $$,
    $$ VALUES ('sequential', 'started', '"world"'::jsonb) $$,
    'start_flow() should return a single run even for flow that have two root steps'
);

SELECT finish();
ROLLBACK;
