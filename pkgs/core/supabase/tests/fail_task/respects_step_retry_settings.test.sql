BEGIN;
SELECT plan(5);
SELECT pgflow_tests.reset_db();
SELECT pgflow_tests.setup_helpers();

-- SETUP: Create a flow with default retry settings (3, 5)
SELECT pgflow.create_flow('step_override');
-- Add a step with custom retry settings that override the flow
SELECT pgflow.add_step('step_override', 'custom_step', ARRAY[]::text[], 1, 3);

-- Start the flow
SELECT pgflow.start_flow('step_override', '{"test": true}'::JSONB);

-- Fail the task first time
WITH task AS (
  SELECT * FROM pgflow.poll_for_tasks('step_override', 1, 1) LIMIT 1
)
SELECT pgflow.fail_task(
  (SELECT run_id FROM task),
  (SELECT step_slug FROM task),
  0,
  'first failure'
);

-- TEST: The task should be queued (first retry)
SELECT is(
  (SELECT status FROM pgflow.step_tasks 
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'step_override')
   AND step_slug = 'custom_step'),
  'queued',
  'Task should be queued after first failure (1st retry of 1)'
);

-- TEST: The retry count should be 1
SELECT is(
  (SELECT retry_count FROM pgflow.step_tasks 
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'step_override')
   AND step_slug = 'custom_step'),
  1,
  'Retry count should be 1 after first failure'
);

-- Fail the task second time
WITH task AS (
  SELECT * FROM pgflow.poll_for_tasks('step_override', 1, 1) LIMIT 1
)
SELECT pgflow.fail_task(
  (SELECT run_id FROM task),
  (SELECT step_slug FROM task),
  0,
  'second failure'
);

-- TEST: The task should be failed (exceeded the step-specific retry limit)
SELECT is(
  (SELECT status FROM pgflow.step_tasks 
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'step_override')
   AND step_slug = 'custom_step'),
  'failed',
  'Task should be failed after second failure (exceeded step retry limit of 1)'
);

-- TEST: The step should be marked as failed
SELECT is(
  (SELECT status FROM pgflow.step_states 
   WHERE run_id = (SELECT run_id FROM pgflow.runs WHERE flow_slug = 'step_override')
   AND step_slug = 'custom_step'),
  'failed',
  'Step should be marked as failed'
);

-- TEST: The run should be failed
SELECT is(
  (SELECT status FROM pgflow.runs 
   WHERE flow_slug = 'step_override'),
  'failed',
  'Run should be failed when step fails'
);

SELECT finish();
ROLLBACK;