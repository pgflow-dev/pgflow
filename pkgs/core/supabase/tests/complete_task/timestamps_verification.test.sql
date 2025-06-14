begin;
select plan(6);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- Start a flow run
select pgflow.start_flow('sequential', '"hello"'::jsonb);

-- Ensure worker exists
select pgflow_tests.ensure_worker('sequential');

-- Start and complete the first task
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "first completed"}'::jsonb
) from task;

-- TEST: Task should have completed_at timestamp set
select isnt(
  (
    select completed_at from pgflow.step_tasks
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'
  ),
  null,
  'Task should have completed_at timestamp set'
);

-- TEST: Task should have failed_at as null
select is(
  (
    select failed_at from pgflow.step_tasks
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'
  ),
  null,
  'Task should have failed_at as null'
);

-- TEST: Step state should have completed_at timestamp set
select isnt(
  (
    select completed_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'
  ),
  null,
  'Step state should have completed_at timestamp set'
);

-- TEST: Step state should have failed_at as null
select is(
  (
    select failed_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'first'
  ),
  null,
  'Step state should have failed_at as null'
);

-- Start and complete all remaining tasks to complete the run
with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "second completed"}'::jsonb
) from task;

with task as (
  select * from pgflow_tests.read_and_start('sequential') limit 1
)
select pgflow.complete_task(
  task.run_id,
  task.step_slug,
  0,
  '{"result": "last completed"}'::jsonb
) from task;

-- -- TEST: Run should have completed_at timestamp set
select isnt(
  (select completed_at from pgflow.runs where run_id = (select run_id from pgflow.runs limit 1)),
  null,
  'Run should have completed_at timestamp set'
);

-- -- TEST: Run should have failed_at as null
select is(
  (select failed_at from pgflow.runs where run_id = (select run_id from pgflow.runs limit 1)),
  null,
  'Run should have failed_at as null'
);

select finish();
rollback;
