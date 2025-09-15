begin;
select plan(8);
select pgflow_tests.reset_db();

-- Test: Normal step producing empty array -> map dependent
select diag('Testing normal step producing [] -> map dependent');

-- Create a flow with normal step followed by map step
select pgflow.create_flow('normal_to_map_flow');

-- Add normal root step
select pgflow.add_step(
  flow_slug => 'normal_to_map_flow',
  step_slug => 'normal_step',
  step_type => 'single'
);

-- Add dependent map step
select pgflow.add_step(
  'normal_to_map_flow',
  'dependent_map',
  ARRAY['normal_step'],
  step_type => 'map'
);

-- Start flow with some input
WITH flow AS (
  SELECT * FROM pgflow.start_flow('normal_to_map_flow', '{"data": "test"}'::jsonb)
)
SELECT run_id INTO TEMPORARY test_run_id FROM flow;

-- Verify the run was created
SELECT isnt(
  (SELECT run_id FROM test_run_id),
  null,
  'Run should be created'
);

-- Verify normal step is started (has a task)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'normal_step'),
  'started',
  'Normal step should be started'
);

-- Verify a task was created for normal step
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id
   where st.step_slug = 'normal_step'),
  1::bigint,
  'One task should be created for normal step'
);

-- Start and complete the task with empty array output
-- First start the task
WITH task AS (
  SELECT * FROM pgflow_tests.read_and_start('normal_to_map_flow', 1, 1) LIMIT 1
)
SELECT pgflow.complete_task(
  (SELECT run_id FROM task),
  (SELECT step_slug FROM task),
  0,
  '[]'::jsonb  -- empty array output
)
FROM task;

-- Verify normal step is completed
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'normal_step'),
  'completed',
  'Normal step should be completed'
);

-- Verify dependent map is completed (cascade should have triggered)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'dependent_map'),
  'completed',
  'Dependent map step should be automatically completed via cascade'
);

-- Verify dependent map has initial_tasks = 0
select is(
  (select ss.initial_tasks from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'dependent_map'),
  0,
  'Dependent map should have initial_tasks = 0'
);

-- Verify no tasks were created for dependent map
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id
   where st.step_slug = 'dependent_map'),
  0::bigint,
  'No tasks should be created for dependent map with empty array'
);

-- Verify the run is completed
select is(
  (select r.status from pgflow.runs r
   join test_run_id t on r.run_id = t.run_id),
  'completed',
  'Run should be completed when all steps are done'
);

select * from finish();
rollback;