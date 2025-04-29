begin;
select plan(3);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with steps and dependencies
select pgflow.create_flow('timestamp_test');
select pgflow.add_step('timestamp_test', 'first_step');
select pgflow.add_step('timestamp_test', 'second_step', array['first_step']);

-- TEST: Flow should have created_at timestamp set
select ok(
  (select created_at is not null from pgflow.flows where flow_slug = 'timestamp_test'),
  'Flow should have created_at timestamp set'
);

-- TEST: Steps should have created_at timestamp set
select ok(
  (select bool_and(created_at is not null) from pgflow.steps where flow_slug = 'timestamp_test'),
  'All steps should have created_at timestamp set'
);

-- TEST: Dependencies should have created_at timestamp set
select ok(
  (select bool_and(created_at is not null) from pgflow.deps where flow_slug = 'timestamp_test'),
  'All dependencies should have created_at timestamp set'
);

select finish();
rollback;
