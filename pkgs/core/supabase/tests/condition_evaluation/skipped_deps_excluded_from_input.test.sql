-- Test: Skipped deps are excluded from handler input (missing key, not null)
-- Verifies that when a dependency is skipped:
-- 1. The handler receives deps_output WITHOUT the skipped dep key
-- 2. The key is missing entirely, not present with null value
--
-- Flow:
--   step_a (conditional, skip) \
--                                -> step_c (no condition)
--   step_b (always runs)       /
--
-- When step_a is skipped, step_c should receive: {"step_b": <output>}
-- (NOT: {"step_a": null, "step_b": <output>})
begin;
select plan(5);

-- Reset database
select pgflow_tests.reset_db();

-- Create flow with diamond: a + b -> c
-- a has unmet condition (will be skipped)
-- b always runs
-- c depends on both
select pgflow.create_flow('skip_diamond');
select pgflow.add_step(
  flow_slug => 'skip_diamond',
  step_slug => 'step_a',
  required_input_pattern => '{"enabled": true}'::jsonb,  -- requires enabled=true
  when_unmet => 'skip'  -- plain skip
);
select pgflow.add_step(
  flow_slug => 'skip_diamond',
  step_slug => 'step_b'
  -- root step, no condition
);
select pgflow.add_step(
  flow_slug => 'skip_diamond',
  step_slug => 'step_c',
  deps_slugs => ARRAY['step_a', 'step_b']
  -- no condition
);

-- Start flow with input that skips step_a
with flow as (
  select * from pgflow.start_flow('skip_diamond', '{"enabled": false}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: step_a should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_a'),
  'skipped',
  'step_a with unmet condition should be skipped'
);

-- Test 2: step_b should be started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_b'),
  'started',
  'step_b without condition should be started'
);

-- Read and start step_b's task
select pgflow_tests.read_and_start('skip_diamond');

-- Complete step_b with some output
select pgflow.complete_task(
  (select run_id from run_ids),
  'step_b',
  0,
  '{"data": "from_b"}'::jsonb
);

-- Test 3: Verify step_c remaining_deps is 0 (ready to start)
select is(
  (select remaining_deps from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  0,
  'step_c remaining_deps should be 0 (a skipped + b completed)'
);

-- Now read and start step_c - this replicates what read_and_start does
-- and allows us to inspect the returned input value
--
-- We need to do this in steps:
-- 1. Read the message from the queue
-- 2. Start the task with start_tasks
-- 3. Inspect the input returned by start_tasks

-- Read the message and store msg_id
with read_msg as (
  select * from pgmq.read_with_poll('skip_diamond', 1, 1, 1, 50)
  limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from read_msg
),
-- Start the task and get the input
start_result as (
  select st.input, st.step_slug, st.run_id
  from pgflow.start_tasks(
    'skip_diamond',
    (select ids from msg_ids),
    pgflow_tests.ensure_worker('skip_diamond')
  ) st
)
-- Store the input for later testing
select input, step_slug, run_id into temporary step_c_inputs
from start_result
where step_slug = 'step_c';

-- Test 4: Verify step_c was started
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'step_c'),
  'started',
  'step_c should be started after read_and_start'
);

-- Test 5: Verify the input does NOT contain step_a key
-- The handler input should only have step_b, NOT step_a
select is(
  (select input from step_c_inputs),
  '{"step_b": {"data": "from_b"}}'::jsonb,
  'step_c input should only contain step_b, not step_a (skipped deps are excluded)'
);

-- Clean up
drop table if exists run_ids;
drop table if exists step_c_inputs;

select finish();
rollback;
