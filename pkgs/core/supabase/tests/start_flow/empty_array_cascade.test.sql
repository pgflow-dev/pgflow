-- Test: Empty array cascade should complete run with proper output and event
-- Reproduces issue where taskless cascades don't trigger run completion logic

BEGIN;
SELECT plan(4);
SELECT pgflow_tests.reset_db();

-- Setup: Create flow with 3 chained map steps
SELECT pgflow.create_flow('empty_cascade_flow', timeout => 1);
SELECT pgflow.add_step('empty_cascade_flow', 'map_1', step_type => 'map');
SELECT pgflow.add_step('empty_cascade_flow', 'map_2', ARRAY['map_1'], step_type => 'map');
SELECT pgflow.add_step('empty_cascade_flow', 'map_3', ARRAY['map_2'], step_type => 'map');

-- Start flow with empty array
SELECT pgflow.start_flow('empty_cascade_flow', '[]'::jsonb);

-- Test 1: Run should be completed
SELECT results_eq(
  $$ SELECT status::text FROM pgflow.runs WHERE flow_slug = 'empty_cascade_flow' $$,
  $$ VALUES ('completed'::text) $$,
  'Run should be completed after empty array cascade'
);

-- Test 2: Run output should be set (not NULL)
SELECT ok(
  (SELECT output IS NOT NULL FROM pgflow.runs WHERE flow_slug = 'empty_cascade_flow'),
  'Run output should be set (not NULL)'
);

-- Test 3: Run output should contain leaf step with empty array
SELECT results_eq(
  $$ SELECT output->'map_3' FROM pgflow.runs WHERE flow_slug = 'empty_cascade_flow' $$,
  $$ VALUES ('[]'::jsonb) $$,
  'Leaf map step output should be empty array'
);

-- Test 4: All step states should be completed
SELECT results_eq(
  $$ SELECT COUNT(*)::int FROM pgflow.step_states
     WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'empty_cascade_flow')
       AND status = 'completed' $$,
  $$ VALUES (3) $$,
  'All 3 step states should be completed'
);

SELECT * FROM finish();
ROLLBACK;
