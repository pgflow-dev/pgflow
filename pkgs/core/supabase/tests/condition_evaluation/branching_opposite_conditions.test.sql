-- Test: Branching pattern - two steps with opposite conditions
-- For any input, exactly ONE step runs (mutual exclusion)
--   step1: if: { role: 'admin' } whenUnmet: 'skip'
--   step2: ifNot: { role: 'admin' } whenUnmet: 'skip'
begin;
select plan(9);

select pgflow_tests.reset_db();

-- Create flow with two mutually exclusive branches
select pgflow.create_flow('branch_flow');
-- Admin branch: only runs when role=admin
select pgflow.add_step(
  flow_slug => 'branch_flow',
  step_slug => 'admin_branch',
  condition_pattern => '{"role": "admin"}'::jsonb,  -- if: role=admin
  when_unmet => 'skip'
);
-- Regular branch: only runs when role!=admin
select pgflow.add_step(
  flow_slug => 'branch_flow',
  step_slug => 'regular_branch',
  condition_not_pattern => '{"role": "admin"}'::jsonb,  -- ifNot: role=admin
  when_unmet => 'skip'
);

-- Test case 1: Admin user -> admin_branch runs, regular_branch skipped
with flow as (
  select * from pgflow.start_flow('branch_flow', '{"role": "admin", "name": "Alice"}'::jsonb)
)

select run_id into temporary run1 from flow;

select is(
  (
    select status from pgflow.step_states
    where run_id = (select run_id from run1) and step_slug = 'admin_branch'
  ),
  'started',
  'Admin user: admin_branch should start'
);

select is(
  (
    select status from pgflow.step_states
    where run_id = (select run_id from run1) and step_slug = 'regular_branch'
  ),
  'skipped',
  'Admin user: regular_branch should be skipped'
);

-- Verify exactly one step started for admin user
select is(
  (
    select count(*)::int from pgflow.step_states
    where run_id = (select run_id from run1) and status = 'started'
  ),
  1,
  'Admin user: exactly one step should start'
);

-- Test case 2: Regular user -> admin_branch skipped, regular_branch runs
with flow as (
  select * from pgflow.start_flow('branch_flow', '{"role": "user", "name": "Bob"}'::jsonb)
)

select run_id into temporary run2 from flow;

select is(
  (
    select status from pgflow.step_states
    where run_id = (select run_id from run2) and step_slug = 'admin_branch'
  ),
  'skipped',
  'Regular user: admin_branch should be skipped'
);

select is(
  (
    select status from pgflow.step_states
    where run_id = (select run_id from run2) and step_slug = 'regular_branch'
  ),
  'started',
  'Regular user: regular_branch should start'
);

-- Verify exactly one step started for regular user
select is(
  (
    select count(*)::int from pgflow.step_states
    where run_id = (select run_id from run2) and status = 'started'
  ),
  1,
  'Regular user: exactly one step should start'
);

-- Test case 3: No role field -> admin_branch skipped, regular_branch runs
-- (Missing field means input does NOT contain role=admin)
with flow as (
  select * from pgflow.start_flow('branch_flow', '{"name": "Charlie"}'::jsonb)
)

select run_id into temporary run3 from flow;

select is(
  (
    select status from pgflow.step_states
    where run_id = (select run_id from run3) and step_slug = 'admin_branch'
  ),
  'skipped',
  'No role: admin_branch should be skipped (pattern not matched)'
);

select is(
  (
    select status from pgflow.step_states
    where run_id = (select run_id from run3) and step_slug = 'regular_branch'
  ),
  'started',
  'No role: regular_branch should start (pattern not matched = ifNot passes)'
);

-- Verify exactly one step started for no-role user
select is(
  (
    select count(*)::int from pgflow.step_states
    where run_id = (select run_id from run3) and status = 'started'
  ),
  1,
  'No role: exactly one step should start'
);

drop table if exists run1, run2, run3;

select finish();
rollback;
