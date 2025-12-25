begin;
select plan(5);
select pgflow_tests.reset_db();

-- =========================================================================
-- Test: flow_input in start_tasks (conditional inclusion)
--
-- Only root non-map steps receive flow_input.
-- Other step types (dependent, map) receive NULL for efficiency.
-- Workers lazy-load flow_input via ctx.flowInput when needed.
-- =========================================================================

-- Test 1: Root non-map step returns flow_input matching original run input
select pgflow.create_flow('simple_flow');
select pgflow.add_step('simple_flow', 'root_step');
select pgflow.start_flow('simple_flow', '{"user_id": "abc123", "config": {"debug": true}}'::jsonb);

select pgflow_tests.ensure_worker('simple_flow');

with msgs as (
  select * from pgmq.read_with_poll('simple_flow', 10, 5, 1, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'simple_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select is(
  (select flow_input from started_tasks),
  '{"user_id": "abc123", "config": {"debug": true}}'::jsonb,
  'Root non-map step flow_input should match original run input'
);

-- Test 2: Dependent step returns NULL flow_input (lazy loaded by worker)
select pgflow_tests.reset_db();
select pgflow.create_flow('dep_flow');
select pgflow.add_step('dep_flow', 'first');
select pgflow.add_step('dep_flow', 'second', ARRAY['first']);
select pgflow.start_flow('dep_flow', '{"original": "input"}'::jsonb);

select pgflow_tests.ensure_worker('dep_flow');

-- Complete first step
with poll_result as (
  select * from pgflow_tests.read_and_start('dep_flow', 1, 1)
)
select pgflow.complete_task(
  run_id,
  step_slug,
  task_index,
  '{"first_result": "done"}'::jsonb
) from poll_result;

-- Start second step and verify flow_input is NULL
select pgflow_tests.ensure_worker('dep_flow', '22222222-2222-2222-2222-222222222222'::uuid);
with msgs as (
  select * from pgmq.read_with_poll('dep_flow', 10, 5, 1, 50) limit 1
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'dep_flow',
    (select ids from msg_ids),
    '22222222-2222-2222-2222-222222222222'::uuid
  )
)
select is(
  (select flow_input from started_tasks),
  NULL::jsonb,
  'Dependent step flow_input should be NULL (lazy loaded by worker)'
);

-- Tests 3 & 4: Root map step returns NULL flow_input
-- Map steps receive NULL because flowInput IS the array (useless to duplicate)
select pgflow_tests.reset_db();
select pgflow.create_flow('map_flow');
select pgflow.add_step('map_flow', 'map_step', '{}', null, null, null, null, 'map');
select pgflow.start_flow('map_flow', '[1, 2, 3]'::jsonb);

select pgflow_tests.ensure_worker('map_flow');

-- Save map tasks to temp table so we can run multiple assertions
create temp table map_started_tasks as
with msgs as (
  select * from pgmq.read_with_poll('map_flow', 10, 5, 3, 50) order by msg_id
),
msg_ids as (
  select array_agg(msg_id order by msg_id) as ids from msgs
)
select * from pgflow.start_tasks(
  'map_flow',
  (select ids from msg_ids),
  '11111111-1111-1111-1111-111111111111'::uuid
);

-- Test 3: All map tasks should have NULL flow_input (consistent)
select is(
  (select count(distinct coalesce(flow_input::text, 'NULL'))::int from map_started_tasks),
  1,
  'All map tasks should have consistent flow_input (all NULL)'
);

-- Test 4: Map task flow_input is NULL (lazy loaded by worker)
select is(
  (select flow_input from map_started_tasks limit 1),
  NULL::jsonb,
  'Map task flow_input should be NULL (lazy loaded by worker)'
);

drop table map_started_tasks;

-- Test 5: Multiple parallel root non-map tasks all have correct flow_input
select pgflow_tests.reset_db();
select pgflow.create_flow('multi_flow');
select pgflow.add_step('multi_flow', 'step1');
select pgflow.add_step('multi_flow', 'step2');  -- parallel step, no deps
select pgflow.start_flow('multi_flow', '{"batch": "test"}'::jsonb);

select pgflow_tests.ensure_worker('multi_flow');

-- Both tasks should be queued, read both
with msgs as (
  select * from pgmq.read_with_poll('multi_flow', 10, 5, 2, 50)
),
msg_ids as (
  select array_agg(msg_id) as ids from msgs
),
started_tasks as (
  select * from pgflow.start_tasks(
    'multi_flow',
    (select ids from msg_ids),
    '11111111-1111-1111-1111-111111111111'::uuid
  )
)
select ok(
  (select bool_and(flow_input = '{"batch": "test"}'::jsonb) from started_tasks),
  'All parallel root non-map tasks should have correct flow_input'
);

select finish();
rollback;
