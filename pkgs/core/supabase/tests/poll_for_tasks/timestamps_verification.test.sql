begin;
select plan(2);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- SETUP: Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- TEST: Step task should have queued_at timestamp set on creation
select ok(
  (select queued_at is not null from pgflow.step_tasks where step_slug = 'first' limit 1),
  'Step task should have queued_at timestamp set on creation'
);

-- SETUP: Poll for tasks
select pgflow.poll_for_tasks('sequential', 1, 1);

-- TEST: Polling for tasks should not affect timestamps
select ok(
  (
    select 
      queued_at is not null and
      completed_at is null and
      failed_at is null
    from pgflow.step_tasks 
    where step_slug = 'first' 
    limit 1
  ),
  'Polling for tasks should not affect timestamps'
);

select finish();
rollback;
