begin;
select plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Only root steps should be started with proper timestamps
--       (Root steps are steps with no dependencies)
select results_eq(
  $$ SELECT step_slug, 
        started_at IS NOT NULL AS has_started_at,
        completed_at IS NULL AS has_no_completed_at,
        failed_at IS NULL AS has_no_failed_at,
        created_at < started_at AS started_after_created
       FROM pgflow.step_states
       WHERE flow_slug = 'sequential'
       AND status = 'started' $$,
  $$ VALUES ('first', true, true, true, true) $$,
  'Only root steps should be started with proper timestamps'
);

select finish();
rollback;
