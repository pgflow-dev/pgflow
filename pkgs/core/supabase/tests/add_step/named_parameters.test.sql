begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create a test flow
select pgflow.create_flow('test_flow');

-- Test: Named parameter for flow_slug and step_slug
select pgflow.add_step(
  flow_slug => 'test_flow',
  step_slug => 'test_named_slugs'
);
select results_eq(
  $$ SELECT step_slug, deps_count FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'test_named_slugs' $$,
  $$ VALUES ('test_named_slugs', 0) $$,
  'Should add step when using named parameters for flow_slug and step_slug'
);

-- Test: Named deps_slugs parameter
select pgflow.add_step(
  flow_slug => 'test_flow',
  step_slug => 'test_deps',
  deps_slugs => ARRAY['test_named_slugs']
);
select results_eq(
  $$ SELECT step_slug, deps_count FROM pgflow.steps WHERE flow_slug = 'test_flow' AND step_slug = 'test_deps' $$,
  $$ VALUES ('test_deps', 1) $$,
  'Should add step with dependency using named deps_slugs parameter'
);

-- Test: All parameters named in order
select pgflow.add_step(
  flow_slug => 'test_flow',
  step_slug => 'test_all_named_in_order',
  deps_slugs => ARRAY['test_named_slugs'],
  max_attempts => 10,
  base_delay => 20,
  timeout => 300
);
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout, deps_count 
     FROM pgflow.steps 
     WHERE flow_slug = 'test_flow' AND step_slug = 'test_all_named_in_order' $$,
  $$ VALUES (10, 20, 300, 1) $$,
  'Should add step when using all named parameters in order'
);

-- Test: All parameters named out of order
select pgflow.add_step(
  timeout => 180,
  step_slug => 'test_all_named_out_of_order',
  flow_slug => 'test_flow',
  deps_slugs => ARRAY['test_named_slugs', 'test_deps'],
  base_delay => 30,
  max_attempts => 5
);
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout, deps_count 
     FROM pgflow.steps 
     WHERE flow_slug = 'test_flow' AND step_slug = 'test_all_named_out_of_order' $$,
  $$ VALUES (5, 30, 180, 2) $$,
  'Should add step when using all named parameters out of order'
);

-- Test: Mix of named and positional parameters (using overloaded function)
select pgflow.add_step(
  'test_flow',
  'test_mixed_params',
  max_attempts => 15,
  base_delay => 25
);
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout is null, deps_count 
     FROM pgflow.steps 
     WHERE flow_slug = 'test_flow' AND step_slug = 'test_mixed_params' $$,
  $$ VALUES (15, 25, true, 0) $$,
  'Should add step when mixing positional and named parameters'
);

-- Test: Overloaded function (no deps_slugs) with named parameters
select pgflow.add_step(
  flow_slug => 'test_flow',
  step_slug => 'test_overloaded_named',
  max_attempts => 7,
  timeout => 120
);
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay is null, opt_timeout, deps_count 
     FROM pgflow.steps 
     WHERE flow_slug = 'test_flow' AND step_slug = 'test_overloaded_named' $$,
  $$ VALUES (7, true, 120, 0) $$,
  'Should add step using overloaded function with named parameters'
);

select * from finish();
rollback;