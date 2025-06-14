BEGIN;
SELECT plan(3);

SELECT pgflow_tests.reset_db();

-- Create a simple flow with a couple steps
SELECT pgflow.create_flow('test_run_states');
SELECT pgflow.add_step('test_run_states', 'step1');
SELECT pgflow.add_step('test_run_states', 'step2', ARRAY['step1']);

-- Start a flow and store the run_id
WITH flow AS (
  SELECT * FROM pgflow.start_flow('test_run_states', '{"test": true}'::jsonb)
)
SELECT run_id INTO TEMPORARY run_id_val FROM flow;

-- Get the run states
WITH states AS (
  SELECT pgflow.get_run_with_states((SELECT run_id FROM run_id_val)) AS result
)
-- Verify the function returns a JSONB object with 'run' key
SELECT is(
  (SELECT result ? 'run' FROM states),
  true,
  'The result should contain a "run" key with the run information'
);

-- Verify the function returns a JSONB object with 'steps' key
WITH states AS (
  SELECT pgflow.get_run_with_states((SELECT run_id FROM run_id_val)) AS result
)
SELECT is(
  (SELECT result ? 'steps' FROM states),
  true,
  'The result should contain a "steps" key with step states information'
);

-- Verify the number of steps in the result matches what we created
WITH states AS (
  SELECT pgflow.get_run_with_states((SELECT run_id FROM run_id_val)) AS result
)
SELECT is(
  (SELECT jsonb_array_length(result->'steps') FROM states),
  2,
  'The result should contain 2 step states'
);

SELECT * FROM finish();
ROLLBACK;