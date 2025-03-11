-- drop function if exists pgflow.start_flow;
create or replace function pgflow.start_flow(
    flow_slug TEXT,
    input JSONB
)
returns setof pgflow.runs
language plpgsql
set search_path to ''
volatile
as $$
declare
  v_created_run pgflow.runs%ROWTYPE;
begin

WITH
  created_run AS (
    INSERT INTO pgflow.runs (flow_slug, input)
    VALUES (start_flow.flow_slug, start_flow.input)
    RETURNING *
  ),
  flow_steps AS (
    SELECT flow_slug, step_slug, deps_count
    FROM pgflow.steps
    WHERE flow_slug = start_flow.flow_slug
  ),
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps)
    SELECT
      start_flow.flow_slug,
      (SELECT run_id FROM created_run),
      fs.step_slug,
      fs.deps_count
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

PERFORM pgflow.start_ready_steps(v_created_run.id);

SELECT * FROM v_created_run;

end;
$$;
