\x
begin;

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots_left_right');

select pgflow.start_flow('two_roots_left_right', '"hello"'::jsonb);
select pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'connected_root',
  0,
  '"connected_root completed"'::jsonb
);
select pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'left',
  0,
  '"left completed"'::jsonb
);
select * from pgflow.step_tasks;
select pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'disconnected_root',
  0,
  '"disconnected_root completed"'::jsonb
);
select pgflow.poll_for_tasks('two_roots_left_right', 1, 1);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'right',
  0,
  '"right completed"'::jsonb
);

select * from pgflow.runs;
select * from pgflow.step_tasks;
rollback;
