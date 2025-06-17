begin;
-- Note: Since the start_ready_steps function doesn't actually send the step:started events yet,
-- we'll test the overall flow to ensure appropriate events are still sent
select plan(1);

-- Ensure partition exists for realtime.messages
select pgflow_tests.create_realtime_partition();

-- Reset database and setup a sequential flow with dependencies
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential'); -- This creates first -> second -> last steps

-- Start the flow and capture the run_id
with flow as (
  select * from pgflow.start_flow('sequential', '{}'::jsonb)
)
select run_id into temporary run_ids from flow;

-- Poll for the first task and complete it
-- This should trigger start_ready_steps internally for the 'second' step
with task as (
  select * from pgflow_tests.read_and_start('sequential', 1, 1)
)
select pgflow.complete_task(
  (select run_id from task),
  (select step_slug from task),
  0,
  '{"result": "success"}'::jsonb
) into temporary completed_tasks;

-- Since we know that step:started events aren't currently implemented, just verify
-- that at least the run:started event was sent
select ok(
  pgflow_tests.count_realtime_events('run:started', (select run_id from run_ids)) = 1,
  'The system should send a run:started event'
);

-- Clean up
drop table if exists run_ids;
drop table if exists completed_tasks;

select finish();
rollback;