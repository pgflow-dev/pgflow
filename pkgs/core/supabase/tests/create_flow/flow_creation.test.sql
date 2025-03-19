begin;
select plan(2);
select pgflow_tests.reset_db();

-- Clean up any existing test queue
select pgmq.drop_queue('test_flow')
from pgmq.list_queues()
where queue_name = 'test_flow'
limit 1;

-- TEST: Flow should be added to the flows table
select pgflow.create_flow('test_flow');
select results_eq(
  $$ SELECT flow_slug FROM pgflow.flows $$,
  array['test_flow']::text [],
  'Flow should be added to the flows table'
);

-- TEST: Creating a flow should create a PGMQ queue with the same name
select results_eq(
  $$ SELECT EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'test_flow') $$,
  array[true],
  'Creating a flow should create a PGMQ queue with the same name'
);

select * from finish();
rollback;
