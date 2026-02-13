-- Test: complete_task returns task row on type violation
--
-- Flow structure:
--   producer -> consumer_map (expects array input)
--
-- Expected behavior:
--   1. producer completes with non-array output
--   2. consumer_map triggers type violation -> fails
--   3. complete_task should return the task row (API contract)
--
-- This is a regression test for the bug where type violation path
-- returned empty result instead of the task row.

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create flow: producer -> consumer_map (expects array)
select pgflow.create_flow('type_violation_return');
select pgflow.add_step(
  flow_slug => 'type_violation_return',
  step_slug => 'producer',
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'type_violation_return',
  step_slug => 'consumer_map',
  deps_slugs => ARRAY['producer'],
  step_type => 'map'
);

-- Start flow
select run_id as test_run_id from pgflow.start_flow('type_violation_return', '{}'::jsonb) \gset

-- Start producer task
select pgflow_tests.ensure_worker('type_violation_return', '11111111-1111-1111-1111-111111111111'::uuid);
SELECT * FROM pgflow_tests.read_and_start('type_violation_return', 1, 1) LIMIT 1;

-- Trigger type violation by completing producer with non-array (consumer_map expects array)
-- Capture the return value
select * into temporary complete_result
from pgflow.complete_task(:'test_run_id'::uuid, 'producer', 0, '{"not": "an array"}'::jsonb);

-- Test 1: complete_task should return exactly one row
select is(
  (select count(*)::int from complete_result),
  1,
  'complete_task should return exactly one row even on type violation'
);

-- Test 2: returned row should have correct step_slug
select is(
  (select step_slug from complete_result),
  'producer',
  'Returned row should have correct step_slug'
);

-- Test 3: returned row should have status 'failed' (task was failed due to type violation)
select is(
  (select status from complete_result),
  'failed',
  'Returned row should have status failed'
);

-- Test 4: run should be failed (proves type-violation path executed)
select is(
  (select status from pgflow.runs where run_id = :'test_run_id'::uuid),
  'failed',
  'Run should be failed - proves type-violation branch executed'
);

-- Test 5: error message should contain type violation signature
select matches(
  (select error_message from complete_result),
  '^\[TYPE_VIOLATION\].*',
  'Error message should start with [TYPE_VIOLATION] signature'
);

-- Cleanup
drop table if exists complete_result;

select * from finish();
rollback;
