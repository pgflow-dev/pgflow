begin;
select plan(7);
select pgflow_tests.reset_db();

-- Test: Sequence of taskless map steps (root map -> dependent map)
select diag('Testing taskless sequence: map root -> map dependent');

-- Create a flow with two map steps in sequence
select pgflow.create_flow('taskless_sequence_flow');

-- Add root map step
select pgflow.add_step(
  flow_slug => 'taskless_sequence_flow',
  step_slug => 'root_map',
  step_type => 'map'
);

-- Add dependent map step
select pgflow.add_step(
  'taskless_sequence_flow',
  'dependent_map',
  ARRAY['root_map'],
  step_type => 'map'
);

-- Start flow with empty array - both steps should cascade to completion
WITH flow AS (
  SELECT * FROM pgflow.start_flow('taskless_sequence_flow', '[]'::jsonb)
)
SELECT run_id INTO TEMPORARY test_run_id FROM flow;

-- Verify the run was created
SELECT isnt(
  (SELECT run_id FROM test_run_id),
  null,
  'Run should be created'
);

-- Verify both step states exist
select is(
  (select count(*) from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id),
  2::bigint,
  'Both step states should exist'
);

-- Verify root map is completed
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'root_map'),
  'completed',
  'Root map step should be automatically completed'
);

-- Verify dependent map is completed (this tests the cascade)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'dependent_map'),
  'completed',
  'Dependent map step should be automatically completed via cascade'
);

-- Verify no tasks were created for either step
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id),
  0::bigint,
  'No tasks should be created for taskless steps'
);

-- Verify the dependent map has remaining_deps = 0 (was decremented)
select is(
  (select ss.remaining_deps from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'dependent_map'),
  0,
  'Dependent map should have remaining_deps decremented to 0'
);

-- Verify the run is completed
select is(
  (select r.status from pgflow.runs r
   join test_run_id t on r.run_id = t.run_id),
  'completed',
  'Run should be completed when all steps are taskless and completed'
);

select * from finish();
rollback;