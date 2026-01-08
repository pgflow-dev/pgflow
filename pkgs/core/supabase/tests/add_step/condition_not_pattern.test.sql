-- Test: add_step - condition_not_pattern parameter
-- Verifies the ifNot pattern (condition_not_pattern) is stored correctly
begin;
select plan(6);

select pgflow_tests.reset_db();
select pgflow.create_flow('ifnot_test');

-- Test 1: Add step with condition_not_pattern only
select pgflow.add_step(
  'ifnot_test',
  'step_with_ifnot',
  condition_not_pattern => '{"role": "admin"}'::jsonb
);

select is(
  (select condition_not_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_with_ifnot'),
  '{"role": "admin"}'::jsonb,
  'condition_not_pattern should be stored correctly'
);

-- Test 2: Default condition_not_pattern should be NULL
select pgflow.add_step('ifnot_test', 'step_default_not');

select is(
  (select condition_not_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_default_not'),
  NULL::jsonb,
  'Default condition_not_pattern should be NULL'
);

-- Test 3: Both condition_pattern and condition_not_pattern together
select pgflow.add_step(
  'ifnot_test',
  'step_with_both',
  condition_pattern => '{"active": true}'::jsonb,
  condition_not_pattern => '{"suspended": true}'::jsonb
);

select ok(
  (select
    condition_pattern = '{"active": true}'::jsonb
    AND condition_not_pattern = '{"suspended": true}'::jsonb
   from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_with_both'),
  'Both condition_pattern and condition_not_pattern should be stored together'
);

-- Test 4: condition_not_pattern with all other options
select pgflow.add_step(
  'ifnot_test',
  'step_all_options',
  max_attempts => 5,
  timeout => 30,
  condition_not_pattern => '{"status": "disabled"}'::jsonb,
  when_unmet => 'skip'
);

select ok(
  (select
    opt_max_attempts = 5
    AND opt_timeout = 30
    AND condition_not_pattern = '{"status": "disabled"}'::jsonb
    AND when_unmet = 'skip'
   from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_all_options'),
  'condition_not_pattern should work with all other step options'
);

-- Test 5: Complex nested condition_not_pattern
select pgflow.add_step(
  'ifnot_test',
  'step_nested_not',
  condition_not_pattern => '{"user": {"role": "admin", "department": "IT"}}'::jsonb
);

select is(
  (select condition_not_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_nested_not'),
  '{"user": {"role": "admin", "department": "IT"}}'::jsonb,
  'Nested condition_not_pattern should be stored correctly'
);

-- Test 6: condition_not_pattern on dependent step
select pgflow.add_step('ifnot_test', 'first_step');
select pgflow.add_step(
  'ifnot_test',
  'dependent_step',
  deps_slugs => ARRAY['first_step'],
  condition_not_pattern => '{"first_step": {"error": true}}'::jsonb
);

select is(
  (select condition_not_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'dependent_step'),
  '{"first_step": {"error": true}}'::jsonb,
  'condition_not_pattern should be stored for dependent step'
);

select finish();
rollback;
