begin;
select plan(9);
select pgflow_tests.reset_db();

-- Load the delete_flow_and_data function
\i _shared/delete_flow_and_data.sql.raw

-- Create test flow with steps and dependencies
select pgflow.create_flow('test_flow_to_delete', max_attempts => 0);
select pgflow.add_step('test_flow_to_delete', 'step1');
select pgflow.add_step('test_flow_to_delete', 'step2', ARRAY['step1']);

-- Start a flow run to generate data
select pgflow.start_flow('test_flow_to_delete', '{}'::jsonb);

-- Test that data exists before deletion
select is(
  (select count(*) from pgflow.flows where flow_slug = 'test_flow_to_delete'),
  1::bigint,
  'Flow should exist before deletion'
);
select is(
  (select count(*) from pgflow.steps where flow_slug = 'test_flow_to_delete'),
  2::bigint,
  'Steps should exist before deletion'
);
select is(
  (select count(*) from pgflow.deps where flow_slug = 'test_flow_to_delete'),
  1::bigint,
  'Dependencies should exist before deletion'
);
select is(
  (select count(*) from pgflow.runs where flow_slug = 'test_flow_to_delete'),
  1::bigint,
  'Run should exist before deletion'
);
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'test_flow_to_delete'),
  2::bigint,
  'Step states should exist before deletion'
);

-- Execute the delete function
select pgflow.delete_flow_and_data('test_flow_to_delete');

-- Test that all data has been deleted
select is(
  (select count(*) from pgflow.flows where flow_slug = 'test_flow_to_delete'),
  0::bigint,
  'Flow should be deleted'
);
select is(
  (select count(*) from pgflow.steps where flow_slug = 'test_flow_to_delete'),
  0::bigint,
  'Steps should be deleted'
);
select is(
  (select count(*) from pgflow.runs where flow_slug = 'test_flow_to_delete'),
  0::bigint,
  'Runs should be deleted'
);
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'test_flow_to_delete'),
  0::bigint,
  'Step states should be deleted'
);

select finish();
rollback;