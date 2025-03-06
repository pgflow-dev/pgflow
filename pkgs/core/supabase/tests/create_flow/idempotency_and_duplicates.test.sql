BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();

-- Setup initial flow
SELECT pgflow.create_flow('test_flow');

-- SETUP: Create flow again to ensure it doesn't throw
SELECT pgflow.create_flow('test_flow');

-- TEST: No duplicate flow should be created
SELECT results_eq(
    $$ SELECT flow_slug FROM pgflow.flows $$,
    ARRAY['test_flow']::text[],
    'No duplicate flow should be created'
);

--TEST: Creating a flow with existing flow_slug should still return the flow
SELECT results_eq(
    $$ SELECT * FROM pgflow.create_flow('test_flow') $$,
    $$ VALUES ('test_flow') $$,
    'Creating a flow with existing flow_slug should still return the flow'
);

SELECT * FROM finish();
ROLLBACK;
