begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create a flow with a step that will fail
select pgflow.create_flow('timestamp_test');
select pgflow.add_step('timestamp_test', 'success_step');
select pgflow.add_step('timestamp_test', 'failure_step', 0);
select pgflow.add_step('timestamp_test', 'dependent_step', array['success_step']);

-- Start a flow run
select pgflow.start_flow('timestamp_test', '"hello"'::jsonb);

-- Complete the success_step
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'success_step',
  0,
  '{"result": "success"}'::jsonb
);

-- Fail the failure_step
select pgflow_tests.poll_and_fail('timestamp_test', 1, 1);

-- TEST: For success_step, completed_at should be after created_at
select ok(
  (
    select completed_at >= created_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'success_step'
  ),
  'For success_step, completed_at should be after created_at'
);

-- TEST: For success_step task, completed_at should be after queued_at
select ok(
  (
    select completed_at >= queued_at from pgflow.step_tasks
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'success_step'
  ),
  'For success_step task, completed_at should be after queued_at'
);

-- TEST: For failure_step, failed_at should be after created_at
select ok(
  (
    select failed_at >= created_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'failure_step'
  ),
  'For failure_step, failed_at should be after created_at'
);

-- TEST: For failure_step task, failed_at should be after queued_at
select ok(
  (
    select failed_at >= queued_at from pgflow.step_tasks
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'failure_step'
  ),
  'For failure_step task, failed_at should be after queued_at'
);

-- TEST: For dependent_step, started_at should be after created_at
select ok(
  (
    select started_at >= created_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs limit 1) and step_slug = 'dependent_step'
  ),
  'For dependent_step, started_at should be after created_at'
);

-- TEST: Run failed_at should be after started_at
select ok(
  (select failed_at >= started_at from pgflow.runs where run_id = (select run_id from pgflow.runs limit 1)),
  'Run failed_at should be after started_at'
);

select finish();
rollback;
