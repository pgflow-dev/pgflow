BEGIN;
SELECT plan(1);
SELECT pgflow_tests.reset_db();

-- SETUP: Create flows first
SELECT pgflow.create_flow('sequential');
SELECT pgflow.add_step('sequential', 'first');
SELECT pgflow.add_step('sequential', 'second', ARRAY['first']);
SELECT pgflow.add_step('sequential', 'last', ARRAY['second']);

-- TEST: start_flow() returns started step states
SELECT results_eq(
    $$ SELECT DISTINCT status
       FROM pgflow.start_flow('sequential', '"hello"'::jsonb) $$,
    $$ VALUES ('started') $$,
    'start_flow() should return only started step states'
);

SELECT finish();
ROLLBACK;
