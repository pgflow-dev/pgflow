-- Test: when_failed='skip' decrements remaining_deps on MULTIPLE dependent steps
--
-- Flow structure (diamond pattern):
--   step_a (when_failed='skip', max_attempts=0)
--     ├── step_b (depends on step_a)
--     └── step_c (depends on step_a)
--
-- Expected behavior:
--   1. step_a fails and gets skipped
--   2. BOTH step_b and step_c have remaining_deps decremented from 1 to 0
--   3. BOTH step_b and step_c become ready and start

begin;
select plan(5);
select pgflow_tests.reset_db();

-- Create diamond flow: step_a -> step_b, step_a -> step_c
select pgflow.create_flow('diamond_skip');
select pgflow.add_step('diamond_skip', 'step_a', max_attempts => 0, when_failed => 'skip');
select pgflow.add_step('diamond_skip', 'step_b', array['step_a']);
select pgflow.add_step('diamond_skip', 'step_c', array['step_a']);

-- Start the flow
select pgflow.start_flow('diamond_skip', '"input"'::jsonb);

-- Poll and fail step_a
select pgflow_tests.poll_and_fail('diamond_skip');

-- Test 1: step_a should be skipped
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_a'
  ),
  'skipped',
  'step_a should be skipped after failure'
);

-- Test 2: step_b.remaining_deps should be decremented to 0
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_b'
  ),
  0::int,
  'step_b.remaining_deps should be decremented to 0'
);

-- Test 3: step_c.remaining_deps should be decremented to 0
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_c'
  ),
  0::int,
  'step_c.remaining_deps should be decremented to 0'
);

-- Test 4: step_b should be started
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_b'
  ),
  'started',
  'step_b should be started'
);

-- Test 5: step_c should be started
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'step_c'
  ),
  'started',
  'step_c should be started'
);

select finish();
rollback;
