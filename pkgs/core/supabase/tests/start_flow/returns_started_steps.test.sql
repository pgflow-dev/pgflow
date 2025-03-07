BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_flow('sequential');
SELECT pgflow_tests.setup_flow('two_roots');

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT step_slug, status
       FROM pgflow.start_flow('sequential', '"hello"'::jsonb) $$,
    $$ VALUES ('first', 'started') $$,
    'start_flow() should return single started root step'
);

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT step_slug, status
       FROM pgflow.start_flow('two_roots', '"hello"'::jsonb) $$,
    $$ VALUES ('root_a', 'started'), ('root_b', 'started') $$,
    'start_flow() should return two started root steps'
);

SELECT finish();
ROLLBACK;
