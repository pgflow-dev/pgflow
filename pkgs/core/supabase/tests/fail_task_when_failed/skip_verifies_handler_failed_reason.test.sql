-- Test: when_failed='skip' sets skip_reason to 'handler_failed'
--
-- This distinguishes handler-failure skips from condition-unmet skips.
--
-- Flow structure:
--   step_a (when_failed='skip', max_attempts=0) → step_b
--
-- Expected behavior:
--   1. step_a fails and gets skipped
--   2. step_a.skip_reason = 'handler_failed'
--   3. step_a.skipped_at is set
--   4. step_a.error_message contains the failure reason

begin;
select plan(4);
select pgflow_tests.reset_db();

-- Create flow
select pgflow.create_flow('skip_reason_test');
select pgflow.add_step('skip_reason_test', 'step_a', max_attempts => 0, when_failed => 'skip');
select pgflow.add_step('skip_reason_test', 'step_b', array['step_a']);

-- Start the flow
select pgflow.start_flow('skip_reason_test', '"input"'::jsonb);

-- Poll and fail step_a
select pgflow_tests.poll_and_fail('skip_reason_test');

-- Test 1: step_a should be skipped
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_a'
  ),
  'skipped',
  'step_a should be skipped'
);

-- Test 2: skip_reason should be 'handler_failed'
select is(
  (
    select skip_reason from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_a'
  ),
  'handler_failed',
  'skip_reason should be handler_failed'
);

-- Test 3: skipped_at should be set
select isnt(
  (
    select skipped_at from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_a'
  ),
  null,
  'skipped_at should be set'
);

-- Test 4: error_message should be set (poll_and_fail generates "step_a FAILED")
select is(
  (
    select error_message from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_a'
  ),
  'step_a FAILED',
  'error_message should be set'
);

select finish();
rollback;
