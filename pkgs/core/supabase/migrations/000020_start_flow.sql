CREATE OR REPLACE FUNCTION pgflow.start_flow(
    flow_slug TEXT,
    payload JSONB
)
RETURNS TABLE (
    flow_slug TEXT,
    run_id UUID,
    status TEXT,
    payload JSONB
)
LANGUAGE sql
SET search_path TO ''
VOLATILE
AS $$

WITH
  created_run AS (
    INSERT INTO pgflow.runs (flow_slug, payload)
    VALUES (start_flow.flow_slug, start_flow.payload)
    RETURNING *
  ),
  flow_steps AS (
    SELECT flow_slug, step_slug
    FROM pgflow.steps
    WHERE flow_slug = start_flow.flow_slug
  ),
  -- root_steps AS (
  --   SELECT s.flow_slug, s.step_slug
  --   FROM pgflow.steps AS s
  --   LEFT JOIN pgflow.deps AS d ON
  --     s.flow_slug = d.flow_slug AND
  --     s.step_slug = d.step_slug
  --   WHERE d.step_slug IS NULL
  -- ),
  created_step_states AS (
    INSERT INTO pgflow.step_states (flow_slug, run_id, step_slug)
    SELECT fs.flow_slug, cr.run_id, fs.step_slug
    FROM created_run AS cr 
    CROSS JOIN flow_steps AS fs
  )
SELECT * FROM created_run;

$$;
