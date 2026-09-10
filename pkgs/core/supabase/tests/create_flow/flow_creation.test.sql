begin;
select plan(5);
select pgflow_tests.reset_db();

-- TEST: Flow should be added to the flows table
select pgflow.create_flow('test_flow');
select results_eq(
  $$ SELECT flow_slug FROM pgflow.flows $$,
  array['test_flow']::text [],
  'Flow should be added to the flows table'
);

-- TEST: Creating a flow is definition-only: no queue DDL (#650)
select results_eq(
  $$ SELECT EXISTS(SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'test_flow') $$,
  array[false],
  'Creating a flow does not create a PGMQ queue'
);

-- TEST: add_step provisions the canonical default through the shared path
select pgflow.add_step('test_flow', 'first_step');
select is(
  (select queue_name::text FROM pgmq.list_queues() WHERE queue_name = 'test_flow'),
  'test_flow',
  'add_step creates the canonical default queue'
);

-- TEST: The step persists its canonical route
select is(
  (select queue_name from pgflow.steps where step_slug = 'first_step'),
  'test_flow',
  'step route is canonical'
);

-- TEST: An empty startup-compiled plain flow provisions its default
select pgflow.ensure_flow_compiled('empty_flow', '{"steps": []}'::jsonb, '{"version": 1}'::jsonb);
select is(
  (select queue_name::text FROM pgmq.list_queues() WHERE queue_name = 'empty_flow'),
  'empty_flow',
  'empty plain flow compiles with its generated default queue'
);

select * from finish();
rollback;
