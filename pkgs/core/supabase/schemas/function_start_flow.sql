create or replace function pgflow.start_flow(
  flow_slug TEXT,
  input JSONB
)
returns setof PGFLOW.RUNS
language plpgsql
set search_path to ''
volatile
as $$
declare
  v_created_run pgflow.runs%ROWTYPE;
begin

WITH
  flow_steps AS (
    SELECT steps.flow_slug, steps.step_slug, steps.deps_count
    FROM pgflow.steps
    WHERE steps.flow_slug = start_flow.flow_slug
  ),
  created_run AS (
    INSERT INTO pgflow.runs (flow_slug, input, remaining_steps)
    VALUES (
      start_flow.flow_slug,
      start_flow.input,
      (SELECT count(*) FROM flow_steps)
    )
    RETURNING *
  ),
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug, remaining_deps)
    SELECT
      fs.flow_slug,
      (SELECT run_id FROM created_run),
      fs.step_slug,
      fs.deps_count
    FROM flow_steps fs
  )
SELECT * FROM created_run INTO v_created_run;

PERFORM pgflow.start_ready_steps(v_created_run.run_id);

RETURN QUERY SELECT * FROM pgflow.runs where run_id = v_created_run.run_id;

end;
$$;