begin;
select plan(5);
select pgflow_tests.reset_db();

-- Test: Single map step with empty array auto-completes via start_flow
select diag('Testing single map step with empty array completes automatically');

-- Create a flow with a single map step
select pgflow.create_flow('single_map_flow');
select pgflow.add_step(
  flow_slug => 'single_map_flow',
  step_slug => 'map_step',
  step_type => 'map'
);

-- Start flow with empty array - this should trigger cascade completion
WITH flow AS (
  SELECT * FROM pgflow.start_flow('single_map_flow', '[]'::jsonb)
)
SELECT run_id INTO TEMPORARY test_run_id FROM flow;

-- Verify the run was created
SELECT isnt(
  (SELECT run_id FROM test_run_id),
  null,
  'Run should be created'
);

-- Verify the step state exists
select is(
  (select count(*) from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'map_step'),
  1::bigint,
  'Step state should exist for map_step'
);

-- Verify the step is completed (this is the key test)
select is(
  (select ss.status from pgflow.step_states ss
   join test_run_id t on ss.run_id = t.run_id
   where ss.step_slug = 'map_step'),
  'completed',
  'Map step with empty array should be automatically completed'
);

-- Verify no tasks were created
select is(
  (select count(*) from pgflow.step_tasks st
   join test_run_id t on st.run_id = t.run_id
   where st.step_slug = 'map_step'),
  0::bigint,
  'No tasks should be created for empty array map step'
);

-- Verify the run is also completed (since it's the only step)
select is(
  (select r.status from pgflow.runs r
   join test_run_id t on r.run_id = t.run_id),
  'completed',
  'Run should be completed when only step is taskless and completed'
);

select * from finish();
rollback;