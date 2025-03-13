begin;
select plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Only root steps should be started
--       (Root steps are steps with no dependencies)
select results_eq(
  $$ SELECT step_slug
       FROM pgflow.step_states
       WHERE flow_slug = 'sequential'
       AND status = 'started' $$,
  $$ VALUES ('first') $$,
  'Only root steps should be started'
);

select finish();
rollback;
