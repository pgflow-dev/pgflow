-- Test: ifNot empty object pattern - step runs when dependency is absent/skipped
--
-- Verifies that ifNot: { dep: {} } (empty object pattern) correctly detects
-- when a dependency is absent (skipped) and causes the fallback step to run.
--
-- PostgreSQL containment semantics:
-- - When dep is skipped, deps_output is {} (empty object)
-- - {} @> { dep: {} } = FALSE (empty object doesn't contain dep key)
-- - NOT(FALSE) = TRUE, so ifNot condition is met -> step runs
begin;
select plan(2);

select pgflow_tests.reset_db();

-- Create flow: skippable_dep -> fallback (with ifNot: { skippable_dep: {} })
select pgflow.create_flow('empty_pattern_test');

-- Step A: Skippable based on input pattern
select pgflow.add_step(
  flow_slug => 'empty_pattern_test',
  step_slug => 'skippable_dep',
  required_input_pattern => '{"run_dep": true}'::jsonb,
  when_unmet => 'skip'
);

-- Step B: Fallback - runs when A is absent (empty object pattern)
select pgflow.add_step(
  flow_slug => 'empty_pattern_test',
  step_slug => 'fallback',
  deps_slugs => ARRAY['skippable_dep'],
  forbidden_input_pattern => '{"skippable_dep": {}}'::jsonb,
  when_unmet => 'skip'
);

-- Start flow with input that causes dep to skip (run_dep: false)
with flow as (
  select * from pgflow.start_flow('empty_pattern_test', '{"run_dep": false}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Test 1: skippable_dep should be skipped
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'skippable_dep'),
  'skipped',
  'Dependency with unmet condition should be skipped'
);

-- Test 2: fallback should be started (empty object pattern matched -> ifNot passed)
select is(
  (select status from pgflow.step_states
   where run_id = (select run_id from run_ids) and step_slug = 'fallback'),
  'started',
  'Step with ifNot: {dep: {}} should start when dep is absent'
);

drop table if exists run_ids;
select finish();
rollback;
