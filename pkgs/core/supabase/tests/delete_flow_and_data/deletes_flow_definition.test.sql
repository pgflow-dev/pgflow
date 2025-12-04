begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create a flow with steps
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first');
select pgflow.add_step('test_flow', 'second', array['first']);

-- Verify setup
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'test_flow'),
  1,
  'Flow should exist before deletion'
);

-- Test: Delete the flow
select pgflow.delete_flow_and_data('test_flow');

-- Verify deletion
select is(
  (select count(*)::int from pgflow.flows where flow_slug = 'test_flow'),
  0,
  'Flow should be deleted'
);

select is(
  (select count(*)::int from pgflow.steps where flow_slug = 'test_flow'),
  0,
  'Steps should be deleted'
);

select finish();
rollback;
