begin;
select plan(3);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Run should have started_at timestamp set on creation
select ok(
  (select started_at is not null from pgflow.runs limit 1),
  'Run should have started_at timestamp set on creation'
);

-- TEST: Step state should have created_at timestamp set on creation
select ok(
  (select created_at is not null from pgflow.step_states limit 1),
  'Step state should have created_at timestamp set on creation'
);

-- TEST: Root step should have started_at timestamp set when started
select ok(
  (select started_at is not null from pgflow.step_states where step_slug = 'first' limit 1),
  'Root step should have started_at timestamp set when started'
);

select finish();
rollback;
