begin;
select plan(9);
select pgflow_tests.reset_db();

-- Test: Two parallel taskless maps -> one normal dependent (fan-in)
select diag('Testing two parallel taskless maps -> one normal dependent');

-- Create a flow with two root taskless maps converging on a normal step
select pgflow.create_flow('maps_to_normal_flow');

-- Add first root map step
select pgflow.add_step(
  flow_slug => 'maps_to_normal_flow',
  step_slug => 'root_map_1',
  step_type => 'map'
);

-- Add second root map step
select pgflow.add_step(
  flow_slug => 'maps_to_normal_flow',
  step_slug => 'root_map_2',
  step_type => 'map'
);

-- Add normal step that depends on both maps
select pgflow.add_step(
  'maps_to_normal_flow',
  'normal_step',
  ARRAY['root_map_1', 'root_map_2'],
  step_type => 'single'
);

-- Start flow with empty array - both root maps should complete, normal step should be ready
WITH flow AS (
  SELECT * FROM pgflow.start_flow('maps_to_normal_flow', '[]'::jsonb)
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

-- Verify first root map is completed
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'root_map_1'),
  'completed',
  'First root map should be automatically completed'
);

-- Verify second root map is completed
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'root_map_2'),
  'completed',
  'Second root map should be automatically completed'
);

-- Verify normal step is started (both dependencies completed)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'normal_step'),
  'started',
  'Normal step should be started after both maps complete'
);

-- Verify normal step has remaining_deps = 0
select is(
  (select ss.remaining_deps from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'normal_step'),
  0,
  'Normal step should have remaining_deps = 0'
);

-- Verify task was created for normal step
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id
   where st.step_slug = 'normal_step'),
  1::bigint,
  'One task should be created for normal step'
);

-- Verify no tasks for the root maps
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id
   where st.step_slug IN ('root_map_1', 'root_map_2')),
  0::bigint,
  'No tasks should be created for taskless maps'
);

-- Verify the run is NOT completed (normal step still needs to run)
select is(
  (select r.status from pgflow.runs r
   join test_run_id t on r.run_id = t.run_id),
  'started',
  'Run should still be started (waiting for normal step)'
);

select * from finish();
rollback;