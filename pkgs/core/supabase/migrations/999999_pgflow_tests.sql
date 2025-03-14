create schema if not exists pgflow_tests;

--------------------------------------------------------------------------------
--------- reset_db -------------------------------------------------------------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.reset_db() returns void as $$
  DELETE FROM pgflow.step_tasks;
  DELETE FROM pgflow.step_states;
  DELETE FROM pgflow.runs;
  DELETE FROM pgflow.deps;
  DELETE FROM pgflow.steps;
  DELETE FROM pgflow.flows;

  SELECT pgmq.drop_queue(queue_name) FROM pgmq.list_queues();
$$ language sql;

--------------------------------------------------------------------------------
--------- setup_flow -----------------------------------------------------------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.setup_flow(
  flow_slug text
) returns void as $$
begin

if flow_slug = 'sequential' then
  PERFORM pgflow.create_flow('sequential');
  PERFORM pgflow.add_step('sequential', 'first');
  PERFORM pgflow.add_step('sequential', 'second', ARRAY['first']);
  PERFORM pgflow.add_step('sequential', 'last', ARRAY['second']);
elsif flow_slug = 'sequential_other' then
  PERFORM pgflow.create_flow('other');
  PERFORM pgflow.add_step('other', 'first');
  PERFORM pgflow.add_step('other', 'second', ARRAY['first']);
  PERFORM pgflow.add_step('other', 'last', ARRAY['second']);
elsif flow_slug = 'two_roots' then
  PERFORM pgflow.create_flow('two_roots');
  PERFORM pgflow.add_step('two_roots', 'root_a');
  PERFORM pgflow.add_step('two_roots', 'root_b');
  PERFORM pgflow.add_step('two_roots', 'last', ARRAY['root_a', 'root_b']);
elsif flow_slug = 'two_roots_left_right' then
  PERFORM pgflow.create_flow('two_roots_left_right');
  PERFORM pgflow.add_step('two_roots_left_right', 'connected_root');
  PERFORM pgflow.add_step('two_roots_left_right', 'disconnected_root');
  PERFORM pgflow.add_step('two_roots_left_right', 'left', ARRAY['connected_root']);
  PERFORM pgflow.add_step('two_roots_left_right', 'right', ARRAY['connected_root']);
else
  RAISE EXCEPTION 'Unknown test flow: %', flow_slug;
end if;

end;
$$ language plpgsql;

--------------------------------------------------------------------------------
------- setup_helpers ----------------------------------------------------------
--------------------------------------------------------------------------------
create or replace function pgflow_tests.setup_helpers() returns void as $$
begin

--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION poll_and_fail(
  flow_slug TEXT,
  vt INTEGER default 1,
  qty INTEGER default 1
) RETURNS VOID AS $sql$
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
$sql$ LANGUAGE sql;
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION poll_and_complete(
  flow_slug TEXT,
  vt INTEGER default 1,
  qty INTEGER default 1
) RETURNS VOID AS $sql$
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
$sql$ LANGUAGE sql;
--------------------------------------------------------------------------------
end;
$$ language plpgsql;
