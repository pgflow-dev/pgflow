begin;
select plan(3);
select pgflow_tests.reset_db();

-- Setup: Create a flow with a map step followed by another map step
-- When the first map receives empty array, it should complete with output=[]
-- and cascade complete the dependent map with output=[]
select pgflow.create_flow('test_taskless_map');
select pgflow.add_step('test_taskless_map', 'root_map', '{}', null, null, null, null, 'map');
select pgflow.add_step('test_taskless_map', 'child_map', array['root_map'], null, null, null, null, 'map');

-- Start the flow with an empty array - this will trigger taskless completion
select pgflow.start_flow('test_taskless_map', '[]'::jsonb);

-- Test 1: Root map step should be completed with output = []
select is(
  (select output from pgflow.step_states where step_slug = 'root_map'),
  '[]'::jsonb,
  'Taskless root map step should have output = []'
);

-- Test 2: Child map step should also be cascade completed with output = []
select is(
  (select output from pgflow.step_states where step_slug = 'child_map'),
  '[]'::jsonb,
  'Taskless child map step should have output = []'
);

-- Test 3: Both steps should be completed
select is(
  (select count(*) from pgflow.step_states where status = 'completed'),
  2::bigint,
  'Both taskless steps should be completed'
);

select * from finish();
rollback;
