begin;
select plan(1);
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

-- This is a regression test for a bug that was showing up when messages
-- were not archived properly after being completed
-- It manifested as completed tasks being updated to 'started'

-- SETUP: Start a flow, poll and complete the first task
select pgflow.start_flow('sequential', '"hello"'::jsonb);
select pgflow.poll_for_tasks('sequential'::text, 0, 1);
select pgflow.complete_task(
  (
    select run_id
    from pgflow.runs
    where flow_slug = 'sequential'
    order by run_id
    limit 1
  ),
  'first',
  0,
  '"first completed"'::jsonb
);
select pgflow.poll_for_tasks('sequential'::text, 0, 1);

-- TEST: Already completed tasks should not be changed
select is(
  (select status from pgflow.step_tasks where step_slug = 'first'),
  'completed',
  'Already completed task should not be changed'
);

select finish();
rollback;
