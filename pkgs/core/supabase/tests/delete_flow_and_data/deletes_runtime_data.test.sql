begin;
select plan(4);
select pgflow_tests.reset_db();

-- Setup: Create flow, start it, create runtime data
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'first');
select pgflow.start_flow('test_flow', '{"input": "test"}'::jsonb);

-- Verify runtime data exists
select is(
  (select count(*)::int from pgflow.runs where flow_slug = 'test_flow'),
  1,
  'Run should exist before deletion'
);

select is(
  (select count(*)::int from pgflow.step_states where flow_slug = 'test_flow'),
  1,
  'Step state should exist before deletion'
);

-- Test: Delete the flow
select pgflow.delete_flow_and_data('test_flow');

-- Verify all runtime data deleted
select is(
  (select count(*)::int from pgflow.runs where flow_slug = 'test_flow'),
  0,
  'Runs should be deleted'
);

select is(
  (select count(*)::int from pgflow.step_states where flow_slug = 'test_flow'),
  0,
  'Step states should be deleted'
);

select finish();
rollback;
