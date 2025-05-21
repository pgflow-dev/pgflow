begin;
select plan(4);
select pgflow_tests.reset_db();

-- Test: Named parameter for flow_slug
select pgflow.create_flow(flow_slug => 'test_named_flow_slug');
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.flows WHERE flow_slug = 'test_named_flow_slug' $$,
  $$ VALUES (3, 5, 60) $$,
  'Should create flow when using named parameter for flow_slug'
);

-- Test: All parameters named in order
select pgflow.create_flow(
  flow_slug => 'test_all_named_params_in_order', 
  max_attempts => 10, 
  base_delay => 15, 
  timeout => 120
);
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.flows WHERE flow_slug = 'test_all_named_params_in_order' $$,
  $$ VALUES (10, 15, 120) $$,
  'Should create flow when using all named parameters in order'
);

-- Test: All parameters named out of order
select pgflow.create_flow(
  timeout => 180,
  flow_slug => 'test_all_named_params_out_of_order', 
  base_delay => 25,
  max_attempts => 15
);
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.flows WHERE flow_slug = 'test_all_named_params_out_of_order' $$,
  $$ VALUES (15, 25, 180) $$,
  'Should create flow when using all named parameters out of order'
);

-- Test: Mix of named and positional parameters
select pgflow.create_flow(
  'test_mixed_params',
  base_delay => 30,
  max_attempts => 20
);
select results_eq(
  $$ SELECT opt_max_attempts, opt_base_delay, opt_timeout FROM pgflow.flows WHERE flow_slug = 'test_mixed_params' $$,
  $$ VALUES (20, 30, 60) $$,
  'Should create flow when mixing positional and named parameters'
);

select * from finish();
rollback;