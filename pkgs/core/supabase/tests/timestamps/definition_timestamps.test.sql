begin;
select plan(6);
select pgflow_tests.reset_db();

-- Record the current time before creating the flow
\set before_time `select now()`

-- Create a flow and add steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first');
select pgflow.add_step('test_flow', 'second', deps => ARRAY['first']);

-- Record the current time after creating the flow and steps
\set after_time `select now()`

-- TEST: Flow created_at should be between before_time and after_time
select ok(
  (select created_at >= :'before_time'::timestamptz and created_at <= :'after_time'::timestamptz 
   from pgflow.flows where flow_slug = 'test_flow'),
  'Flow created_at should be between before_time and after_time'
);

-- TEST: Steps created_at should be between before_time and after_time
select ok(
  (select bool_and(created_at >= :'before_time'::timestamptz and created_at <= :'after_time'::timestamptz)
   from pgflow.steps where flow_slug = 'test_flow'),
  'Steps created_at should be between before_time and after_time'
);

-- TEST: Dependencies created_at should be between before_time and after_time
select ok(
  (select bool_and(created_at >= :'before_time'::timestamptz and created_at <= :'after_time'::timestamptz)
   from pgflow.deps where flow_slug = 'test_flow'),
  'Dependencies created_at should be between before_time and after_time'
);

-- Create another flow after a small delay
select pg_sleep(0.1);
\set before_time2 `select now()`
select pgflow.create_flow('test_flow2');
\set after_time2 `select now()`

-- TEST: Second flow created_at should be between before_time2 and after_time2
select ok(
  (select created_at >= :'before_time2'::timestamptz and created_at <= :'after_time2'::timestamptz 
   from pgflow.flows where flow_slug = 'test_flow2'),
  'Second flow created_at should be between before_time2 and after_time2'
);

-- TEST: Second flow created_at should be after first flow created_at
select ok(
  (select (select created_at from pgflow.flows where flow_slug = 'test_flow2') > 
          (select created_at from pgflow.flows where flow_slug = 'test_flow')),
  'Second flow created_at should be after first flow created_at'
);

-- Add a step to the second flow
select pg_sleep(0.1);
\set before_time3 `select now()`
select pgflow.add_step('test_flow2', 'first');
\set after_time3 `select now()`

-- TEST: Step in second flow created_at should be between before_time3 and after_time3
select ok(
  (select created_at >= :'before_time3'::timestamptz and created_at <= :'after_time3'::timestamptz 
   from pgflow.steps where flow_slug = 'test_flow2' and step_slug = 'first'),
  'Step in second flow created_at should be between before_time3 and after_time3'
);

select finish();
rollback;
