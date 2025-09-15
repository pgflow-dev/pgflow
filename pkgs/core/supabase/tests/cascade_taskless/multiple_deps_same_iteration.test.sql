begin;
select plan(15);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database
select pgflow_tests.reset_db();

-- Test: Multiple dependencies completing in the same cascade iteration
-- should properly decrement remaining_deps for each completed dependency
--
-- Setup: a -> b (map, empty)
--        a -> c (map, empty)
--        b,c -> d (single step)
-- When 'a' completes, both 'b' and 'c' become ready and complete (empty arrays)
-- The bug: 'd' has 2 deps (b,c) but only decrements by 1 instead of 2

-- Create test flow
select pgflow.create_flow('multi_deps_test');

-- Root step
select pgflow.add_step(
  flow_slug => 'multi_deps_test',
  step_slug => 'a',
  step_type => 'single'
);

-- Two map steps that depend on 'a' (will get empty arrays)
select pgflow.add_step(
  flow_slug => 'multi_deps_test',
  step_slug => 'b',
  deps_slugs => array['a'],
  step_type => 'map'
);

select pgflow.add_step(
  flow_slug => 'multi_deps_test',
  step_slug => 'c',
  deps_slugs => array['a'],
  step_type => 'map'
);

-- Single step that depends on both map steps
select pgflow.add_step(
  flow_slug => 'multi_deps_test',
  step_slug => 'd',
  deps_slugs => array['b', 'c'],
  step_type => 'single'
);

-- Start the flow
with flow as (
  select * from pgflow.start_flow('multi_deps_test', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Get the run_id for our tests
select run_id::text as run_id from run_ids limit 1 \gset

-- Verify initial state
select is(
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'a'),
  'started',
  'Step a should be started initially'
);

select is(
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'b'),
  'created',
  'Step b should be created initially'
);

select is(
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'c'),
  'created',
  'Step c should be created initially'
);

select is(
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'd'),
  'created',
  'Step d should be created initially'
);

select is(
  (select remaining_deps from pgflow.step_states where run_id = :'run_id' and step_slug = 'd'),
  2,
  'Step d should have 2 remaining dependencies initially'
);

-- Complete step 'a' with empty array output (this will make b and c get empty arrays)
select pgflow.complete_task(
  task => jsonb_build_object(
    'flow_slug', 'multi_deps_test',
    'run_id', :'run_id'::uuid,
    'step_slug', 'a',
    'task_index', 0
  ),
  output => '[]'::jsonb
);

-- Debug: Check state immediately after complete_task
select diag(format('After complete_task - b: initial_tasks=%s, remaining_deps=%s, status=%s',
  (select initial_tasks from pgflow.step_states where run_id = :'run_id' and step_slug = 'b'),
  (select remaining_deps from pgflow.step_states where run_id = :'run_id' and step_slug = 'b'),
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'b')
));

select diag(format('After complete_task - c: initial_tasks=%s, remaining_deps=%s, status=%s',
  (select initial_tasks from pgflow.step_states where run_id = :'run_id' and step_slug = 'c'),
  (select remaining_deps from pgflow.step_states where run_id = :'run_id' and step_slug = 'c'),
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'c')
));

-- Now check that the cascade worked correctly
-- Both b and c should complete (they got empty arrays from a)
select is(
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'b'),
  'completed',
  'Step b should be completed (got empty array from a)'
);

select is(
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'c'),
  'completed',
  'Step c should be completed (got empty array from a)'
);

-- The critical test: step d should have remaining_deps = 0
-- If the bug exists, it would have remaining_deps = 1 (only decremented once)
select is(
  (select remaining_deps from pgflow.step_states where run_id = :'run_id' and step_slug = 'd'),
  0,
  'Step d should have 0 remaining dependencies (BUG if = 1)'
);

-- Step d should now be started (not stuck)
select is(
  (select status from pgflow.step_states where run_id = :'run_id' and step_slug = 'd'),
  'started',
  'Step d should be started (BUG if still created)'
);

-- Verify b and c are taskless (initial_tasks = 0)
select is(
  (select initial_tasks from pgflow.step_states where run_id = :'run_id' and step_slug = 'b'),
  0,
  'Step b should have initial_tasks = 0'
);

select is(
  (select initial_tasks from pgflow.step_states where run_id = :'run_id' and step_slug = 'c'),
  0,
  'Step c should have initial_tasks = 0'
);

-- Check that b and c have completed timestamps (cascaded)
select isnt(
  (select completed_at from pgflow.step_states where run_id = :'run_id' and step_slug = 'b'),
  null,
  'Step b should have completed_at timestamp'
);

select isnt(
  (select completed_at from pgflow.step_states where run_id = :'run_id' and step_slug = 'c'),
  null,
  'Step c should have completed_at timestamp'
);

-- Verify remaining_tasks for taskless steps
select is(
  (select remaining_tasks from pgflow.step_states where run_id = :'run_id' and step_slug = 'b'),
  0,
  'Step b should have remaining_tasks = 0'
);

select is(
  (select remaining_tasks from pgflow.step_states where run_id = :'run_id' and step_slug = 'c'),
  0,
  'Step c should have remaining_tasks = 0'
);

select finish();
rollback;