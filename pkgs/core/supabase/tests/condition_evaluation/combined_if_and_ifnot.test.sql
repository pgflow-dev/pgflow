-- Test: Combined if+ifNot - BOTH conditions must pass (AND semantics)
-- Pattern: "active admin who is NOT suspended"
--   if: { role: 'admin', active: true }
--   ifNot: { suspended: true }
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Create flow with step that has both if and ifNot conditions
select pgflow.create_flow('combined_flow');
select pgflow.add_step(
  flow_slug => 'combined_flow',
  step_slug => 'admin_action',
  required_input_pattern => '{"role": "admin", "active": true}'::jsonb,  -- if
  forbidden_input_pattern => '{"suspended": true}'::jsonb,  -- ifNot
  when_unmet => 'skip'
);
-- Add another step without conditions
select pgflow.add_step('combined_flow', 'always_step');

-- Test case 1: Active admin NOT suspended -> BOTH conditions met -> step runs
with flow as (
  select * from pgflow.start_flow('combined_flow', '{"role": "admin", "active": true}'::jsonb)
)
select run_id into temporary run1 from flow;

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run1) and step_slug = 'admin_action'),
  'started',
  'Active admin not suspended: both conditions met, step should start'
);

-- Test case 2: Active admin BUT suspended -> if passes, ifNot fails -> step skipped
with flow as (
  select * from pgflow.start_flow('combined_flow', '{"role": "admin", "active": true, "suspended": true}'::jsonb)
)
select run_id into temporary run2 from flow;

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run2) and step_slug = 'admin_action'),
  'skipped',
  'Active admin but suspended: ifNot fails, step should be skipped'
);

select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run2) and step_slug = 'admin_action'),
  'condition_unmet',
  'Skip reason should be condition_unmet'
);

-- Test case 3: Regular user NOT suspended -> if fails -> step skipped
with flow as (
  select * from pgflow.start_flow('combined_flow', '{"role": "user", "active": true}'::jsonb)
)
select run_id into temporary run3 from flow;

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run3) and step_slug = 'admin_action'),
  'skipped',
  'Regular user: if condition fails, step should be skipped'
);

-- Test case 4: Inactive admin -> if fails -> step skipped
with flow as (
  select * from pgflow.start_flow('combined_flow', '{"role": "admin", "active": false}'::jsonb)
)
select run_id into temporary run4 from flow;

select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run4) and step_slug = 'admin_action'),
  'skipped',
  'Inactive admin: if condition fails (active!=true), step should be skipped'
);

-- Test case 5: always_step should run in all cases (checking last run)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run4) and step_slug = 'always_step'),
  'started',
  'Step without condition should always start'
);

drop table if exists run1, run2, run3, run4;

select finish();
rollback;
