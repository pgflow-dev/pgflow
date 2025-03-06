BEGIN;
SELECT plan(2);
SELECT pgflow_tests.reset_db();

-- Clean up any existing test queue
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

SELECT * FROM finish();
ROLLBACK;
