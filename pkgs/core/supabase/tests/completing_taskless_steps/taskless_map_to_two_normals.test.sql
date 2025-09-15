begin;
select plan(8);
select pgflow_tests.reset_db();

-- Test: Taskless map root -> two normal dependents
select diag('Testing taskless map root -> two normal dependents');

-- Create a flow with taskless map root and two normal dependents
select pgflow.create_flow('map_to_normals_flow');

-- Add root map step
select pgflow.add_step(
  flow_slug => 'map_to_normals_flow',
  step_slug => 'root_map',
  step_type => 'map'
);

-- Add first normal dependent
select pgflow.add_step(
  'map_to_normals_flow',
  'normal_step_1',
  ARRAY['root_map'],
  step_type => 'single'
);

-- Add second normal dependent
select pgflow.add_step(
  'map_to_normals_flow',
  'normal_step_2',
  ARRAY['root_map'],
  step_type => 'single'
);

-- Start flow with empty array - root map should complete, normal steps should be ready
WITH flow AS (
  SELECT * FROM pgflow.start_flow('map_to_normals_flow', '[]'::jsonb)
)
SELECT run_id INTO TEMPORARY test_run_id FROM flow;

-- Verify the run was created
SELECT isnt(
  (SELECT run_id FROM test_run_id),
  null,
  'Run should be created'
);

-- Verify all three step states exist
select is(
  (select count(*) from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id),
  3::bigint,
  'All three step states should exist'
);

-- Verify root map is completed (taskless)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'root_map'),
  'completed',
  'Root map step should be automatically completed'
);

-- Verify first normal step is started (has remaining_deps = 0)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'normal_step_1'),
  'started',
  'First normal step should be started'
);

-- Verify second normal step is started (has remaining_deps = 0)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'normal_step_2'),
  'started',
  'Second normal step should be started'
);

-- Verify tasks were created for both normal steps
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id
   where st.step_slug IN ('normal_step_1', 'normal_step_2')),
  2::bigint,
  'Two tasks should be created for normal steps'
);

-- Verify no tasks for the root map
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id
   where st.step_slug = 'root_map'),
  0::bigint,
  'No tasks should be created for taskless root map'
);

-- Verify the run is NOT completed (normal steps still need to run)
select is(
  (select r.status from pgflow.runs r
   join test_run_id t on r.run_id = t.run_id),
  'started',
  'Run should still be started (waiting for normal steps)'
);

select * from finish();
rollback;