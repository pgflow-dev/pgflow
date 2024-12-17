BEGIN;
SELECT plan(10);
SELECT pgflow_tests.mock_call_edgefn();

-- Test 1: Setup test data
INSERT INTO pgflow.flows (flow_slug) VALUES ('test_flow');
INSERT INTO pgflow.steps (flow_slug, step_slug) VALUES 
  ('test_flow', 'test_step'),
  ('test_flow', 'failed_step'),
  ('test_flow', 'completed_step');

-- Create a run with known UUID
WITH new_run AS (
    INSERT INTO pgflow.runs (flow_slug, run_id, status, payload)
    VALUES ('test_flow', gen_random_uuid(), 'pending', '{}'::jsonb)
    RETURNING *
)
SELECT run_id INTO TEMP run_id FROM new_run;

-- Create required step_state
INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, failed_at, completed_at)
VALUES 
  ('test_flow', (SELECT run_id FROM run_id), 'test_step', NULL, NULL),
  ('test_flow', (SELECT run_id FROM run_id), 'failed_step', now(), NULL),
  ('test_flow', (SELECT run_id FROM run_id), 'completed_step', NULL, now());

-- Test 2: Should create new step task when none exists
SELECT lives_ok(
  $$ SELECT pgflow.enqueue_step_task('test_flow', (SELECT run_id FROM run_id), 'test_step', '{}'::jsonb) $$,
  'Should create new step task successfully'
);

SELECT is(
  (SELECT count(*) FROM pgflow.step_tasks WHERE run_id = (SELECT run_id FROM run_id)),
  1::bigint,
  'Should create exactly one step task'
);

SELECT is(
  (SELECT attempt_count FROM pgflow.step_tasks WHERE run_id = (SELECT run_id FROM run_id)),
  1::integer,
  'New task should have attempt_count = 1'
);

-- Test 3: Should increment attempt count when retrying existing task
SELECT pgflow.enqueue_step_task('test_flow', (SELECT run_id FROM run_id), 'test_step', '{}'::jsonb);

SELECT is(
  (SELECT attempt_count FROM pgflow.step_tasks WHERE run_id = (SELECT run_id FROM run_id)),
  2::integer,
  'Retried task should increment attempt_count'
);

-- Test 4: Should reset status and timestamps when retrying
SELECT is(
  (SELECT status FROM pgflow.step_tasks WHERE run_id = (SELECT run_id FROM run_id)),
  'queued',
  'Retried task should have queued status'
);

SELECT is(
  (SELECT next_attempt_at IS NOT NULL FROM pgflow.step_tasks WHERE run_id = (SELECT run_id FROM run_id)),
  true,
  'Retried task should have next_attempt_at set'
);

-- Test 5: Should fail when run doesn't exist
SELECT throws_like(
  $$ SELECT pgflow.enqueue_step_task('test_flow', gen_random_uuid(), 'test_step', '{}'::jsonb) $$,
  '%Run not found%'
);

-- Test 6: Should fail when step state doesn't exist
SELECT throws_like(
  $$ SELECT pgflow.enqueue_step_task('test_flow', (SELECT run_id FROM run_id), 'nonexistent_step', '{}'::jsonb) $$,
  '%Step state not found%'
);

-- Test 7: Should fail when step state is completed
SELECT throws_like(
  $$ SELECT pgflow.enqueue_step_task('test_flow', (SELECT run_id FROM run_id), 'completed_step', '{}'::jsonb) $$,
  '%Cannot enqueue task for step in completed status%'
);

-- Test 8: Should fail when step state is failed
SELECT throws_like(
  $$ SELECT pgflow.enqueue_step_task('test_flow', (SELECT run_id FROM run_id), 'failed_step', '{}'::jsonb) $$,
  '%Cannot enqueue task for step in failed status%'
);

SELECT finish();
ROLLBACK;
