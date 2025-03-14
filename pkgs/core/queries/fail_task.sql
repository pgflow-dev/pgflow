\x
begin;
select pgflow_tests.reset_db();
select pgflow_tests.setup_flow('two_roots_left_right');

CREATE OR REPLACE FUNCTION poll_and_fail(
  flow_slug TEXT,
  vt INTEGER default 1,
  qty INTEGER default 1
) RETURNS VOID AS $$
  -- Poll for a task and complete it in one step
  WITH task AS (
    SELECT * FROM pgflow.poll_for_tasks(flow_slug, vt, qty) LIMIT 1
  )
  SELECT pgflow.fail_task(
    (SELECT run_id FROM task),
    (SELECT step_slug FROM task),
    0,
    concat(task.step_slug, ' FAILED')
  )
  FROM task;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION poll_and_complete(
  flow_slug TEXT,
  vt INTEGER default 1,
  qty INTEGER default 1
) RETURNS VOID AS $$
  -- Poll for a task and complete it in one step
  WITH task AS (
    SELECT * FROM pgflow.poll_for_tasks(flow_slug, vt, qty) LIMIT 1
  )
  SELECT pgflow.complete_task(
    (SELECT run_id FROM task),
    (SELECT step_slug FROM task),
    0,
    jsonb_build_object('input', task.input)
  )
  FROM task;
$$ LANGUAGE sql;

--------------------------------------------------------------------------------
--------------------------------------------------------------------------------
--------------------------------------------------------------------------------


select pgflow.start_flow('two_roots_left_right', '"hello"'::jsonb);

select poll_and_complete('two_roots_left_right');
select poll_and_complete('two_roots_left_right');
select poll_and_complete('two_roots_left_right');
select poll_and_complete('two_roots_left_right');

SELECT jsonb_pretty(output) from pgflow.runs;
select * from pgflow.runs;

rollback;
