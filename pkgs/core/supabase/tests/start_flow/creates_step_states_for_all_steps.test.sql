begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');
select pgflow_tests.setup_flow('sequential_other');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: All step states from flow should be created
select set_eq(
  $$ SELECT step_slug
       FROM pgflow.step_states WHERE flow_slug = 'sequential' $$,
  array['first', 'second', 'last']::text [],
  'All step states from flow should be created'
);

-- TEST: No steps from other flows should be created
select is_empty(
  $$ SELECT * FROM pgflow.step_states WHERE flow_slug <> 'sequential' $$,
  'No steps from other flows should be created'
);

select finish();
rollback;
