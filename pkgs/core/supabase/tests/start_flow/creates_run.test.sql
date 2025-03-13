begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should be created
select results_eq(
  $$ SELECT flow_slug, status, input from pgflow.runs $$,
  $$ VALUES ('sequential', 'started', '"hello"'::jsonb) $$,
  'Run should be created with appropriate status and input'
);

-- TEST: remaining_steps should be equal to number of steps
select is(
  (select remaining_steps::int from pgflow.runs limit 1),
  3::int,
  'remaining_steps should be equal to number of steps'
);

select finish();
rollback;
