-- Test: add_step - New condition parameters
-- Verifies required_input_pattern, when_unmet, when_failed parameters work correctly
begin;
select plan(9);

select pgflow_tests.reset_db();
select pgflow.create_flow('condition_test');

-- Test 1: Add step with required_input_pattern
select pgflow.add_step(
  'condition_test',
  'step_with_condition',
  required_input_pattern => '{"type": "premium"}'::jsonb
);

select is(
  (select required_input_pattern from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_with_condition'),
  '{"type": "premium"}'::jsonb,
  'required_input_pattern should be stored correctly'
);

-- Test 2: Add step with when_unmet = skip
select pgflow.add_step(
  'condition_test',
  'step_skip_unmet',
  when_unmet => 'skip'
);

select is(
  (select when_unmet from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_skip_unmet'),
  'skip',
  'when_unmet should be skip'
);

-- Test 3: Add step with when_unmet = skip-cascade
select pgflow.add_step(
  'condition_test',
  'step_skip_cascade_unmet',
  when_unmet => 'skip-cascade'
);

select is(
  (select when_unmet from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_skip_cascade_unmet'),
  'skip-cascade',
  'when_unmet should be skip-cascade'
);

-- Test 4: Add step with when_failed = skip
select pgflow.add_step(
  'condition_test',
  'step_skip_failed',
  when_failed => 'skip'
);

select is(
  (select when_failed from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_skip_failed'),
  'skip',
  'when_failed should be skip'
);

-- Test 5: Add step with when_failed = skip-cascade
select pgflow.add_step(
  'condition_test',
  'step_skip_cascade_failed',
  when_failed => 'skip-cascade'
);

select is(
  (select when_failed from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_skip_cascade_failed'),
  'skip-cascade',
  'when_failed should be skip-cascade'
);

-- Test 6: Default when_unmet should be skip (natural default for conditions)
select pgflow.add_step('condition_test', 'step_default_unmet');

select is(
  (select when_unmet from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_default_unmet'),
  'skip',
  'Default when_unmet should be skip'
);

-- Test 7: Default when_failed should be fail
select is(
  (select when_failed from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_default_unmet'),
  'fail',
  'Default when_failed should be fail'
);

-- Test 8: Default required_input_pattern should be NULL
select is(
  (select required_input_pattern from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_default_unmet'),
  NULL::jsonb,
  'Default required_input_pattern should be NULL'
);

-- Test 9: Add step with all condition parameters
select pgflow.add_step(
  'condition_test',
  'step_all_params',
  required_input_pattern => '{"status": "active"}'::jsonb,
  when_unmet => 'skip',
  when_failed => 'skip-cascade'
);

select ok(
  (select
    required_input_pattern = '{"status": "active"}'::jsonb
    AND when_unmet = 'skip'
    AND when_failed = 'skip-cascade'
   from pgflow.steps
   where flow_slug = 'condition_test' and step_slug = 'step_all_params'),
  'All condition parameters should be stored correctly together'
);

select finish();
rollback;
