begin;
select plan(3);
select pgflow_tests.reset_db();

-- Create a flow and add steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first');
select pgflow.add_step('test_flow', 'second', deps => ARRAY['first']);

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

select finish();
rollback;
