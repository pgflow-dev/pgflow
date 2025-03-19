begin;
select plan(2);
select pgflow_tests.reset_db();

-- Create a simple flow first
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step_one');
select pgflow.add_step('test_flow', 'step_two', array['step_one']);
select
  pgflow.add_step('test_flow', 'step_three', array['step_one', 'step_two']);

-- Run the same flow creation and step addition sequence again to verify those are idempotent
select pgflow.create_flow('test_flow');
select pgflow.add_step('test_flow', 'step_one');
select pgflow.add_step('test_flow', 'step_two', array['step_one']);
select
  pgflow.add_step('test_flow', 'step_three', array['step_one', 'step_two']);

-- Check the state after first sequence
select results_eq(
  $$ SELECT step_slug FROM pgflow.steps WHERE flow_slug = 'test_flow' ORDER BY step_slug $$,
  array['step_one', 'step_three', 'step_two']::text [],
  'No duplicated steps were created'
);

-- Verify the state hasn't changed
select results_eq(
  $$ SELECT DISTINCT flow_slug FROM pgflow.flows $$,
  array['test_flow']::text [],
  'No duplicated flows were created'
);

select * from finish();
rollback;
