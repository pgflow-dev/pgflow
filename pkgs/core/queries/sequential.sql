begin;

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

select pgflow.start_flow('sequential', '"hello"'::jsonb);
select * from pgflow.step_states;
select * from pgflow.step_tasks;

-- Two-phase polling approach:
-- Phase 1: Read messages
select * from pgflow.read_with_poll('sequential', 2, 1);
-- Phase 2: Start tasks (example with dummy msg_id and worker_id)
-- select * from pgflow.start_tasks('sequential', array[1], '00000000-0000-0000-0000-000000000000'::uuid);
select * from pgflow.step_states;
select * from pgflow.step_tasks;

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'first',
  0,
  '"first completed"'::jsonb
);
select * from pgflow.step_states;
select * from pgflow.step_tasks;

-- Two-phase polling approach:
-- Phase 1: Read messages
select * from pgflow.read_with_poll('sequential', 2, 1);
-- Phase 2: Start tasks (example with dummy msg_id and worker_id)
-- select * from pgflow.start_tasks('sequential', array[1], '00000000-0000-0000-0000-000000000000'::uuid);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'second',
  0,
  '"second completed"'::jsonb
);
select * from pgflow.step_states;
select * from pgflow.step_tasks;

-- Two-phase polling approach:
-- Phase 1: Read messages
select * from pgflow.read_with_poll('sequential', 2, 1);
-- Phase 2: Start tasks (example with dummy msg_id and worker_id)
-- select * from pgflow.start_tasks('sequential', array[1], '00000000-0000-0000-0000-000000000000'::uuid);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'last',
  0,
  '"last completed"'::jsonb
);
select * from pgflow.step_states;
select * from pgflow.step_tasks;

select * from pgflow.runs;

rollback;
