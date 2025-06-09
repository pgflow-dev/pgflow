begin;
select plan(6);
select pgflow_tests.reset_db();

-- SETUP: Create separate flows to avoid random task selection
select pgflow.create_flow('success_flow');
select pgflow.add_step('success_flow', 'success_step');

select pgflow.create_flow('failure_flow');
select pgflow.add_step('failure_flow', 'failure_step', 0);

select pgflow.create_flow('dependent_flow');
select pgflow.add_step('dependent_flow', 'root_step');
select pgflow.add_step('dependent_flow', 'dependent_step', array['root_step']);

-- Start flow runs
select pgflow.start_flow('success_flow', '"hello"'::jsonb);
select pgflow.start_flow('failure_flow', '"hello"'::jsonb);
select pgflow.start_flow('dependent_flow', '"hello"'::jsonb);

-- Start and complete the success_step
select pgflow_tests.read_and_start('success_flow');
select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'success_flow'),
  'success_step',
  0,
  '{"result": "success"}'::jsonb
);

-- Fail the failure_step
select pgflow_tests.poll_and_fail('failure_flow', 1, 1);

-- Complete root_step to start dependent_step
select pgflow_tests.read_and_start('dependent_flow');
select pgflow.complete_task(
  (select run_id from pgflow.runs where flow_slug = 'dependent_flow'),
  'root_step',
  0,
  '{"result": "root completed"}'::jsonb
);

-- Start the dependent_step (after root_step is completed)
select pgflow_tests.read_and_start('dependent_flow');

-- TEST: For success_step, completed_at should be after created_at
select ok(
  (
    select completed_at >= created_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs where flow_slug = 'success_flow') and step_slug = 'success_step'
  ),
  'For success_step, completed_at should be after created_at'
);

-- TEST: For success_step task, completed_at should be after queued_at
select ok(
  (
    select completed_at >= queued_at from pgflow.step_tasks
    where run_id = (select run_id from pgflow.runs where flow_slug = 'success_flow') and step_slug = 'success_step'
  ),
  'For success_step task, completed_at should be after queued_at'
);

-- TEST: For failure_step, failed_at should be after created_at
select ok(
  (
    select failed_at >= created_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs where flow_slug = 'failure_flow') and step_slug = 'failure_step'
  ),
  'For failure_step, failed_at should be after created_at'
);

-- TEST: For failure_step task, failed_at should be after queued_at
select ok(
  (
    select failed_at >= queued_at from pgflow.step_tasks
    where run_id = (select run_id from pgflow.runs where flow_slug = 'failure_flow') 
      and step_slug = 'failure_step'
  ),
  'For failure_step task, failed_at should be after queued_at'
);

-- TEST: For dependent_step, started_at should be after created_at
select ok(
  (
    select started_at >= created_at from pgflow.step_states
    where run_id = (select run_id from pgflow.runs where flow_slug = 'dependent_flow') and step_slug = 'dependent_step'
  ),
  'For dependent_step, started_at should be after created_at'
);

-- TEST: Run failed_at should be after started_at
select ok(
  (select failed_at >= started_at from pgflow.runs where flow_slug = 'failure_flow'),
  'Run failed_at should be after started_at'
);

select finish();
rollback;
