-- Test: add_step - forbidden_input_pattern parameter
-- Verifies the ifNot pattern (forbidden_input_pattern) is stored correctly
begin;
select plan(6);

select pgflow_tests.reset_db();
select pgflow.create_flow('ifnot_test');

-- Test 1: Add step with forbidden_input_pattern only
select pgflow.add_step(
  'ifnot_test',
  'step_with_ifnot',
  forbidden_input_pattern => '{"role": "admin"}'::jsonb
);

select is(
  (select forbidden_input_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_with_ifnot'),
  '{"role": "admin"}'::jsonb,
  'forbidden_input_pattern should be stored correctly'
);

-- Test 2: Default forbidden_input_pattern should be NULL
select pgflow.add_step('ifnot_test', 'step_default_not');

select is(
  (select forbidden_input_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_default_not'),
  NULL::jsonb,
  'Default forbidden_input_pattern should be NULL'
);

-- Test 3: Both required_input_pattern and forbidden_input_pattern together
select pgflow.add_step(
  'ifnot_test',
  'step_with_both',
  required_input_pattern => '{"active": true}'::jsonb,
  forbidden_input_pattern => '{"suspended": true}'::jsonb
);

select ok(
  (select
    required_input_pattern = '{"active": true}'::jsonb
    AND forbidden_input_pattern = '{"suspended": true}'::jsonb
   from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_with_both'),
  'Both required_input_pattern and forbidden_input_pattern should be stored together'
);

-- Test 4: forbidden_input_pattern with all other options
select pgflow.add_step(
  'ifnot_test',
  'step_all_options',
  max_attempts => 5,
  timeout => 30,
  forbidden_input_pattern => '{"status": "disabled"}'::jsonb,
  when_unmet => 'skip'
);

select ok(
  (select
    opt_max_attempts = 5
    AND opt_timeout = 30
    AND forbidden_input_pattern = '{"status": "disabled"}'::jsonb
    AND when_unmet = 'skip'
   from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_all_options'),
  'forbidden_input_pattern should work with all other step options'
);

-- Test 5: Complex nested forbidden_input_pattern
select pgflow.add_step(
  'ifnot_test',
  'step_nested_not',
  forbidden_input_pattern => '{"user": {"role": "admin", "department": "IT"}}'::jsonb
);

select is(
  (select forbidden_input_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'step_nested_not'),
  '{"user": {"role": "admin", "department": "IT"}}'::jsonb,
  'Nested forbidden_input_pattern should be stored correctly'
);

-- Test 6: forbidden_input_pattern on dependent step
select pgflow.add_step('ifnot_test', 'first_step');
select pgflow.add_step(
  'ifnot_test',
  'dependent_step',
  deps_slugs => ARRAY['first_step'],
  forbidden_input_pattern => '{"first_step": {"error": true}}'::jsonb
);

select is(
  (select forbidden_input_pattern from pgflow.steps
   where flow_slug = 'ifnot_test' and step_slug = 'dependent_step'),
  '{"first_step": {"error": true}}'::jsonb,
  'forbidden_input_pattern should be stored for dependent step'
);

select finish();
rollback;
