begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should be created with proper timestamps
select results_eq(
  $$ SELECT flow_slug, status, input, 
        started_at IS NOT NULL AS has_started_at,
        completed_at IS NULL AS has_no_completed_at,
        failed_at IS NULL AS has_no_failed_at
     FROM pgflow.runs $$,
  $$ VALUES ('sequential', 'started', '"hello"'::jsonb, true, true, true) $$,
  'Run should be created with appropriate status, input, and timestamps'
);

-- TEST: remaining_steps should be equal to number of steps
select is(
  (select remaining_steps::int from pgflow.runs limit 1),
  3::int,
  'remaining_steps should be equal to number of steps'
);

select finish();
rollback;
