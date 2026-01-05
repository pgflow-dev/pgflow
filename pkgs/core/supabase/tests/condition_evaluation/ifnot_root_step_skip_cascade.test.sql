-- Test: ifNot pattern MATCHES (condition not met) with whenUnmet='skip-cascade'
-- Step and all dependents should be skipped
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Create flow with ifNot step and a dependent
select pgflow.create_flow('ifnot_cascade_flow');
select pgflow.add_step(
  flow_slug => 'ifnot_cascade_flow',
  step_slug => 'no_admin_step',
  forbidden_input_pattern => '{"role": "admin"}'::jsonb,  -- must NOT contain role=admin
  when_unmet => 'skip-cascade'
);
-- Add a dependent step
select pgflow.add_step('ifnot_cascade_flow', 'dependent_step', ARRAY['no_admin_step']);
-- Add an independent step
select pgflow.add_step('ifnot_cascade_flow', 'independent_step');

-- Start flow with input that MATCHES the ifNot pattern (role=admin)
with flow as (
  select * from pgflow.start_flow('ifnot_cascade_flow', '{"role": "admin", "name": "Alice"}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: no_admin_step should be 'skipped'
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  'skipped',
  'Step with matched ifNot pattern and whenUnmet=skip-cascade should be skipped'
);

-- Test 2: skip_reason for no_admin_step should be 'condition_unmet'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'no_admin_step'),
  'condition_unmet',
  'Skip reason should be condition_unmet'
);

-- Test 3: dependent_step should also be 'skipped' (cascade)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'dependent_step'),
  'skipped',
  'Dependent step should be skipped due to cascade'
);

-- Test 4: skip_reason for dependent_step should be 'dependency_skipped'
select is(
  (select skip_reason from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'dependent_step'),
  'dependency_skipped',
  'Dependent skip reason should be dependency_skipped'
);

-- Test 5: independent_step should be started normally
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'independent_step'),
  'started',
  'Independent step should start normally'
);

-- Test 6: Run should continue
select is(
  (select status from pgflow.runs where run_id = (select run_id from run_ids)),
  'started',
  'Run should continue when step is skip-cascaded'
);

drop table if exists run_ids;

select finish();
rollback;
