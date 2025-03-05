BEGIN;
SELECT plan(3);

DELETE FROM pgflow.deps;
DELETE FROM pgflow.steps;
DELETE FROM pgflow.flows;

-- TEST: Flow should be added to the flows table
SELECT pgflow.create_flow('test_flow');
SELECT results_eq(
    $$ SELECT flow_slug FROM pgflow.flows $$,
    ARRAY['test_flow']::text[],
    'Flow should be added to the flows table'
);

-- TEST: No duplicate flow should be created and no error thrown
SELECT pgflow.create_flow('test_flow');
SELECT results_eq(
    $$ SELECT flow_slug FROM pgflow.flows $$,
    ARRAY['test_flow']::text[],
    'No duplicate flow should be created and no error thrown'
);

-- TEST: Should detect and prevent invalid flow slug
SELECT throws_ok(
    $$ SELECT pgflow.create_flow('invalid-flow') $$,
    'new row for relation "flows" violates check constraint "flows_flow_slug_check"',
    'Should detect and prevent invalid flow slug'
);

SELECT * FROM finish();
ROLLBACK;
