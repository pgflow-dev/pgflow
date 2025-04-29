begin;
select plan(6);
select pgflow_tests.reset_db();

-- Create a flow and add steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first');
select pgflow.add_step('test_flow', 'second', ARRAY['first']);

-- TEST: Flow should have created_at timestamp set
select isnt(
  (select created_at from pgflow.flows where flow_slug = 'test_flow'),
  null,
  'Flow should have created_at timestamp set'
);

-- TEST: Steps should have created_at timestamp set
select isnt(
  (select created_at from pgflow.steps where flow_slug = 'test_flow' limit 1),
  null,
  'Steps should have created_at timestamp set'
);

-- TEST: Dependencies should have created_at timestamp set
select isnt(
  (select created_at from pgflow.deps where flow_slug = 'test_flow'),
  null,
  'Dependencies should have created_at timestamp set'
);

-- Create another flow
select pgflow.create_flow('test_flow2');

-- TEST: Second flow should have created_at timestamp set
select isnt(
  (select created_at from pgflow.flows where flow_slug = 'test_flow2'),
  null,
  'Second flow should have created_at timestamp set'
);

-- TEST: Second flow created_at should be after first flow created_at
select ok(
  (select (select created_at from pgflow.flows where flow_slug = 'test_flow2') > 
          (select created_at from pgflow.flows where flow_slug = 'test_flow')),
  'Second flow created_at should be after first flow created_at'
);

-- Add a step to the second flow
select pgflow.add_step('test_flow2', 'first');

-- TEST: Step in second flow should have created_at timestamp set
select isnt(
  (select created_at from pgflow.steps where flow_slug = 'test_flow2' and step_slug = 'first'),
  null,
  'Step in second flow should have created_at timestamp set'
);

select finish();
rollback;
