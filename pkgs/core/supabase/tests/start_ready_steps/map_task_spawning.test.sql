begin;
select plan(10);
select pgflow_tests.reset_db();

-- Test: Map step spawns N tasks based on initial_tasks
select diag('Testing map step spawns multiple tasks');

-- Create a flow with a map step
select pgflow.create_flow('test_map_spawning');
select pgflow.add_step(
  flow_slug => 'test_map_spawning',
  step_slug => 'map_step',
  step_type => 'map'
);

-- Start flow with array input - this will initialize step_states properly
select run_id as test_run_id from pgflow.start_flow('test_map_spawning', '[1, 2, 3]'::jsonb) \gset

-- Verify step status changed to 'started'
select is(
  (select status from pgflow.step_states 
   where run_id = :'test_run_id' and step_slug = 'map_step'),
  'started',
  'Map step should be in started status'
);

-- Verify remaining_tasks was set to initial_tasks
select is(
  (select remaining_tasks from pgflow.step_states 
   where run_id = :'test_run_id' and step_slug = 'map_step'),
  3,
  'remaining_tasks should be set to initial_tasks (3)'
);

-- Verify 3 tasks were created with correct task_index values
select is(
  (select count(*) from pgflow.step_tasks 
   where run_id = :'test_run_id' and step_slug = 'map_step'),
  3::bigint,
  'Should create 3 tasks for map step'
);

-- Verify task_index values are 0, 1, 2
select set_eq(
  $$select task_index from pgflow.step_tasks 
    where run_id = '$$ || :'test_run_id' || $$' and step_slug = 'map_step'
    order by task_index$$,
  ARRAY[0, 1, 2],
  'Task indices should be 0, 1, 2'
);

-- Verify all tasks are in 'queued' status
select is(
  (select count(*) from pgflow.step_tasks 
   where run_id = :'test_run_id' and step_slug = 'map_step' and status = 'queued'),
  3::bigint,
  'All tasks should be in queued status'
);

-- Test: Single step still spawns only 1 task
select diag('Testing single step spawns only 1 task');

-- Create a new flow with a single root step for this test
select pgflow.create_flow('test_single_spawning');
select pgflow.add_step(
  flow_slug => 'test_single_spawning',
  step_slug => 'single_step',
  step_type => 'single'
);

-- Start flow with any input
select run_id as single_run_id from pgflow.start_flow('test_single_spawning', '{}'::jsonb) \gset

-- Verify single step spawns only 1 task
select is(
  (select count(*) from pgflow.step_tasks
   where run_id = :'single_run_id' and step_slug = 'single_step'),
  1::bigint,
  'Single step should create only 1 task'
);

-- Verify single step task has task_index = 0
select is(
  (select task_index from pgflow.step_tasks
   where run_id = :'single_run_id' and step_slug = 'single_step'),
  0,
  'Single step task should have task_index = 0'
);

-- Test: Empty array map step (initial_tasks = 0) auto-completes
select diag('Testing empty array map step auto-completes');

-- Create another flow for empty array test
select pgflow.create_flow('test_empty_map');
select pgflow.add_step(
  flow_slug => 'test_empty_map',
  step_slug => 'empty_map_step',
  step_type => 'map'
);

-- Start flow with empty array - this will handle everything
select run_id as empty_run_id from pgflow.start_flow('test_empty_map', '[]'::jsonb) \gset

-- Verify step went directly to 'completed' status
select is(
  (select status from pgflow.step_states 
   where run_id = :'empty_run_id' and step_slug = 'empty_map_step'),
  'completed',
  'Empty array map step should go directly to completed'
);

-- Verify no tasks were created
select is(
  (select count(*) from pgflow.step_tasks 
   where run_id = :'empty_run_id' and step_slug = 'empty_map_step'),
  0::bigint,
  'No tasks should be created for empty array map step'
);

-- Verify completed_at is set
select isnt(
  (select completed_at from pgflow.step_states 
   where run_id = :'empty_run_id' and step_slug = 'empty_map_step'),
  null,
  'completed_at should be set for auto-completed map step'
);

select * from finish();
rollback;