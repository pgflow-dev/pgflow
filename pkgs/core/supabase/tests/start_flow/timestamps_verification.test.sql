begin;
select plan(4);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should have started_at timestamp set
select isnt(
  (select started_at from pgflow.runs limit 1),
  null,
  'Run should have started_at timestamp set'
);

-- TEST: Run should have completed_at and failed_at as null
select results_eq(
  $$ SELECT completed_at, failed_at from pgflow.runs limit 1 $$,
  $$ VALUES (null::timestamptz, null::timestamptz) $$,
  'Run should have completed_at and failed_at as null'
);

-- TEST: Step states should have created_at timestamp set
select isnt(
  (select created_at from pgflow.step_states where run_id = (select run_id from pgflow.runs limit 1) limit 1),
  null,
  'Step states should have created_at timestamp set'
);

-- TEST: Dependent Step states further down the line should have started_at, completed_at, and failed_at as null
select is(
  (
    select count(*)::int
    from pgflow.step_states
    where
      run_id = (select run_id from pgflow.runs limit 1)
      and step_slug != 'first'
      and completed_at is null
      and failed_at is null
      and started_at is null
  ),
  2,
  'Dependent Step states should have started_at, completed_at, and failed_at as null'
);

select finish();
rollback;
