\x
begin;

select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots_left_right');

select pgflow.start_flow('two_roots_left_right', '"hello"'::jsonb);
-- Two-phase polling: read_with_poll + start_tasks
select * from pgflow.read_with_poll('two_roots_left_right', 2, 1);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'connected_root',
  0,
  '"connected_root completed"'::jsonb
);
-- Two-phase polling: read_with_poll + start_tasks
select * from pgflow.read_with_poll('two_roots_left_right', 2, 1);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'left',
  0,
  '"left completed"'::jsonb
);
select * from pgflow.step_tasks;
-- Two-phase polling: read_with_poll + start_tasks
select * from pgflow.read_with_poll('two_roots_left_right', 2, 1);
select pgflow.complete_task(
  (select run_id from pgflow.runs limit 1),
  'disconnected_root',
  0,
  '"disconnected_root completed"'::jsonb
);
-- Two-phase polling: read_with_poll + start_tasks
select * from pgflow.read_with_poll('two_roots_left_right', 2, 1);
-- select pgflow.complete_task(
--   (select run_id from pgflow.runs limit 1),
--   'right',
--   0,
--   '"right completed"'::jsonb
-- );
select pgflow.fail_task(
  (select run_id from pgflow.runs limit 1),
  'right',
  0,
  'invalid http request'
);
select pgflow.fail_task(
  (select run_id from pgflow.runs limit 1),
  'right',
  0,
  'invalid http request'
);
select pgflow.fail_task(
  (select run_id from pgflow.runs limit 1),
  'right',
  0,
  'invalid http request'
);

select * from pgflow.runs;
select * from pgflow.step_tasks;
select * from pgflow.step_states;
rollback;
