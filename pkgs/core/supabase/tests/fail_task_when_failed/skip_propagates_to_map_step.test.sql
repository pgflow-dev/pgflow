-- Test: when_failed='skip' propagates correctly to map step dependent
--
-- This mirrors the behavior of when_unmet='skip' for conditions:
-- - Map step with skipped dependency gets initial_tasks=0
-- - Map step auto-completes with output=[]
--
-- Flow structure:
--   producer (when_failed='skip', max_attempts=0) → map_consumer (map step)
--
-- Expected behavior:
--   1. producer fails and gets skipped
--   2. map_consumer.remaining_deps decremented to 0
--   3. map_consumer.initial_tasks set to 0 (skipped dep = empty array)
--   4. map_consumer auto-completes with status='completed', output='[]'
--   5. Run completes

begin;
select plan(7);
select pgflow_tests.reset_db();

-- Create flow with producer -> map_consumer
select pgflow.create_flow('map_skip_test');
select pgflow.add_step('map_skip_test', 'producer', max_attempts => 0, when_failed => 'skip');
-- Map consumer: step_type='map' handles empty array from skipped producer
select pgflow.add_step('map_skip_test', 'map_consumer', array['producer'], step_type => 'map');

-- Start the flow
select pgflow.start_flow('map_skip_test', '"input"'::jsonb);

-- Verify initial state
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'map_consumer'
  ),
  1::int,
  'map_consumer should start with remaining_deps = 1'
);

-- Poll and fail producer
select pgflow_tests.poll_and_fail('map_skip_test');

-- Test 1: producer should be skipped
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'producer'
  ),
  'skipped',
  'producer should be skipped after failure'
);

-- Test 2: map_consumer.remaining_deps should be 0
select is(
  (
    select remaining_deps from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'map_consumer'
  ),
  0::int,
  'map_consumer.remaining_deps should be decremented to 0'
);

-- Test 3: map_consumer.initial_tasks should be 0 (skipped dep = empty array)
select is(
  (
    select initial_tasks from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'map_consumer'
  ),
  0::int,
  'map_consumer.initial_tasks should be 0'
);

-- Test 4: map_consumer should be completed (auto-completed with zero tasks)
select is(
  (
    select status from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'map_consumer'
  ),
  'completed',
  'map_consumer should be auto-completed'
);

-- Test 5: map_consumer.output should be empty array
select is(
  (
    select output from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug = 'map_consumer'
  ),
  '[]'::jsonb,
  'map_consumer.output should be empty array'
);

-- Test 6: Run should be completed
select is(
  (select status from pgflow.runs limit 1),
  'completed',
  'Run should be completed'
);

select finish();
rollback;
