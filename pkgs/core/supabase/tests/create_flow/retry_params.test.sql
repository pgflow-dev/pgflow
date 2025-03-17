BEGIN;
SELECT plan(6);
SELECT pgflow_tests.reset_db();

-- Test flow creation with custom retry parameters
SELECT pgflow.create_flow(
  'custom_retry_flow',
  retry_limit => 5,  -- retry_limit
  retry_delay => 15  -- retry_delay
);

-- Verify retry parameters were set correctly
SELECT is(
  (SELECT retry_limit FROM pgflow.flows WHERE flow_slug = 'custom_retry_flow'),
  5,
  'retry_limit should be set to 5'
);

SELECT is(
  (SELECT retry_delay FROM pgflow.flows WHERE flow_slug = 'custom_retry_flow'),
  15,
  'retry_delay should be set to 15'
);

-- Test flow creation with default retry parameters
SELECT pgflow.create_flow('default_retry_flow');

-- Verify default retry parameters
SELECT is(
  (SELECT retry_limit FROM pgflow.flows WHERE flow_slug = 'default_retry_flow'),
  3,
  'retry_limit should default to 3'
);

SELECT is(
  (SELECT retry_delay FROM pgflow.flows WHERE flow_slug = 'default_retry_flow'),
  5,
  'retry_delay should default to 5'
);

-- SETUP: Create flow with same slug to verify if retries wont get updated
-- 5 - original retry_limit
-- 15 - original retry_delay
SELECT pgflow.create_flow(
  'custom_retry_flow',
  10,  -- retry_limit
  20   -- retry_delay
);

-- TEST: Verify parameters were NOT updated
SELECT is(
  (SELECT retry_limit FROM pgflow.flows WHERE flow_slug = 'custom_retry_flow'),
  5, -- original retry_limit
  'retry_limit should NOT be updated'
);

SELECT is(
  (SELECT retry_delay FROM pgflow.flows WHERE flow_slug = 'custom_retry_flow'),
  15, -- original retry_delay
  'retry_delay should NOT be updated'
);

SELECT * FROM finish();
ROLLBACK;
