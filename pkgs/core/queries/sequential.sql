begin;

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('sequential');

select pgflow.start_flow('sequential', '"hello"'::jsonb);
select * from pgflow.step_states;
select * from pgflow.step_tasks;

select * from pgflow.poll_for_tasks('sequential', 1, 1);
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

select * from pgflow.poll_for_tasks('sequential', 1, 1);

select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'second',
  0,
  '"second completed"'::jsonb
);
select * from pgflow.step_states;
select * from pgflow.step_tasks;

select * from pgflow.poll_for_tasks('sequential', 1, 1);

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
