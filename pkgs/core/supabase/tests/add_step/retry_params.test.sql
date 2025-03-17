BEGIN;
SELECT plan(6);
SELECT pgflow_tests.reset_db();

-- Setup
SELECT pgflow.create_flow('test_flow');

-- Test adding step with retry parameters
SELECT pgflow.add_step(
  'test_flow',
  'step_with_retry',
  ARRAY[]::text[],
  5, -- retry_limit
  10 -- retry_delay
);

-- Verify retry parameters were set correctly
SELECT is(
  (SELECT retry_limit FROM pgflow.steps
   WHERE flow_slug = 'test_flow' AND step_slug = 'step_with_retry'),
  5,
  'retry_limit should be set to 5'
);

SELECT is(
  (SELECT retry_delay FROM pgflow.steps
   WHERE flow_slug = 'test_flow' AND step_slug = 'step_with_retry'),
  10,
  'retry_delay should be set to 10'
);

-- Test adding step without retry parameters
SELECT pgflow.add_step('test_flow', 'step_without_retry');

-- Verify default NULL values for retry parameters
SELECT is(
  (SELECT retry_limit FROM pgflow.steps
   WHERE flow_slug = 'test_flow' AND step_slug = 'step_without_retry'),
  NULL,
  'retry_limit should be NULL when not specified'
);

SELECT is(
  (SELECT retry_delay FROM pgflow.steps
   WHERE flow_slug = 'test_flow' AND step_slug = 'step_without_retry'),
  NULL,
  'retry_delay should be NULL when not specified'
);

-- SETUP: Create flow with same slug to verify if retries wont get updated
-- 5 - original retry_limit
-- 10 - original retry_delay
SELECT pgflow.add_step(
  'test_flow',
  'step_with_retry',
  ARRAY[]::text[],
  3, -- new retry_limit
  6  -- new retry_delay
);

-- Verify parameters were updated
SELECT is(
  (SELECT retry_limit FROM pgflow.steps
   WHERE flow_slug = 'test_flow' AND step_slug = 'step_with_retry'),
  5,
  'retry_limit should NOT be updated'
);

SELECT is(
  (SELECT retry_delay FROM pgflow.steps
   WHERE flow_slug = 'test_flow' AND step_slug = 'step_with_retry'),
  10,
  'retry_delay should NOT be updated'
);

SELECT * FROM finish();
ROLLBACK;
