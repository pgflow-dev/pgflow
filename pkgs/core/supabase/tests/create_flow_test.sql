BEGIN;
SELECT plan(5);

DELETE FROM pgflow.deps;
DELETE FROM pgflow.steps;
DELETE FROM pgflow.flows;

-- Clean up any existing test queue by first checking if it exists
SELECT pgmq.drop_queue('test_flow') 
FROM pgmq.list_queues() 
WHERE queue_name = 'test_flow'
LIMIT 1;

-- TEST: Flow should be added to the flows table
SELECT pgflow.create_flow('test_flow');
SELECT results_eq(
    $$ SELECT flow_slug FROM pgflow.flows $$,
    ARRAY['test_flow']::text[],
    'Flow should be added to the flows table'
);

-- TEST: Creating a flow should create a PGMQ queue with the same name
SELECT results_eq(
    $$ SELECT EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'test_flow') $$,
    ARRAY[true],
    'Creating a flow should create a PGMQ queue with the same name'
);

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

-- TEST: Should detect and prevent invalid flow slug
SELECT throws_ok(
    $$ SELECT pgflow.create_flow('invalid-flow') $$,
    'new row for relation "flows" violates check constraint "flows_flow_slug_check"',
    'Should detect and prevent invalid flow slug'
);

SELECT * FROM finish();
ROLLBACK;
