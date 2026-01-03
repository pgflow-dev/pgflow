begin;
select plan(2);
select pgflow_tests.reset_db();

-- Setup: Create a flow with a single root map step
-- When started with empty array, root map should complete via start_ready_steps
select pgflow.create_flow('test_root_empty_map');
select pgflow.add_step('test_root_empty_map', 'root_map', '{}', null, null, null, null, 'map');

-- Start the flow with an empty array - this will trigger empty map completion in start_ready_steps
select pgflow.start_flow('test_root_empty_map', '[]'::jsonb);

-- Test 1: Root map step should be completed with output = []
select is(
  (select output from pgflow.step_states where step_slug = 'root_map'),
  '[]'::jsonb,
  'Root empty map step should have output = [] (set by start_ready_steps)'
);

-- Test 2: Step should be completed
select is(
  (select status from pgflow.step_states where step_slug = 'root_map'),
  'completed',
  'Root empty map step should be completed'
);

select * from finish();
rollback;
