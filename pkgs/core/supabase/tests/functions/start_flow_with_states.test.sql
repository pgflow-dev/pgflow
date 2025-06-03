BEGIN;
SELECT plan(4);

SELECT pgflow_tests.reset_db();

-- Create a simple flow with a couple steps
SELECT pgflow.create_flow('test_flow_states');
SELECT pgflow.add_step('test_flow_states', 'step1');
SELECT pgflow.add_step('test_flow_states', 'step2', ARRAY['step1']);

-- Start the flow and get states in one call
WITH run_states AS (
  SELECT pgflow.start_flow_with_states('test_flow_states', '{"test": true}'::jsonb) AS result
)
-- Verify the result is returning data
SELECT is(
  (SELECT result ? 'run' FROM run_states),
  true,
  'The function should return a JSONB object with a run key'
);

-- Use a custom run_id
WITH custom_run AS (
  SELECT pgflow.start_flow_with_states(
    'test_flow_states', 
    '{"custom": true}'::jsonb,
    '12345678-1234-1234-1234-123456789012'::uuid
  ) AS result
)
-- Verify the run has the specified run_id
SELECT is(
  (SELECT (result->'run'->>'run_id')::uuid FROM custom_run),
  '12345678-1234-1234-1234-123456789012'::uuid,
  'The function should use the provided run_id'
);

-- Start a flow with states and check steps
WITH result AS (
  SELECT pgflow.start_flow_with_states('test_flow_states', '{"more": true}'::jsonb) AS data
)
-- Verify the number of steps in the result
SELECT is(
  (SELECT jsonb_array_length(data->'steps') FROM result),
  2,
  'The response should contain 2 steps'
);

-- Verify that root steps are in the correct state
WITH result AS (
  SELECT pgflow.start_flow_with_states('test_flow_states', '{"final": true}'::jsonb) AS data
),
steps AS (
  SELECT jsonb_array_elements(data->'steps') AS step FROM result
)
SELECT is(
  (SELECT step->>'status' FROM steps WHERE step->>'step_slug' = 'step1'),
  'started',
  'Root steps should be in started status'
);

SELECT * FROM finish();
ROLLBACK;