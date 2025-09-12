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

-- Start a flow with an array input of 3 items
insert into pgflow.runs (flow_slug, status, input)
values ('test_map_spawning', 'started', '[1, 2, 3]'::jsonb)
returning run_id as test_run_id \gset

-- Initialize step states (simulating what start_flow does)
insert into pgflow.step_states (flow_slug, run_id, step_slug, initial_tasks, remaining_deps)
values ('test_map_spawning', :'test_run_id', 'map_step', 3, 0);

-- Call start_ready_steps to spawn tasks
select pgflow.start_ready_steps(:'test_run_id');

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

-- Add a single step
select pgflow.add_step(
  flow_slug => 'test_map_spawning',
  step_slug => 'single_step',
  step_type => 'single'
);

-- Initialize single step state
insert into pgflow.step_states (flow_slug, run_id, step_slug, initial_tasks, remaining_deps)
values ('test_map_spawning', :'test_run_id', 'single_step', 1, 0);

-- Call start_ready_steps again
select pgflow.start_ready_steps(:'test_run_id');

-- Verify single step spawns only 1 task
select is(
  (select count(*) from pgflow.step_tasks 
   where run_id = :'test_run_id' and step_slug = 'single_step'),
  1::bigint,
  'Single step should create only 1 task'
);

-- Verify single step task has task_index = 0
select is(
  (select task_index from pgflow.step_tasks 
   where run_id = :'test_run_id' and step_slug = 'single_step'),
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

-- Start flow with empty array
insert into pgflow.runs (flow_slug, status, input)
values ('test_empty_map', 'started', '[]'::jsonb)
returning run_id as empty_run_id \gset

-- Initialize step state with initial_tasks = 0
insert into pgflow.step_states (flow_slug, run_id, step_slug, initial_tasks, remaining_deps)
values ('test_empty_map', :'empty_run_id', 'empty_map_step', 0, 0);

-- Call start_ready_steps
select pgflow.start_ready_steps(:'empty_run_id');

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