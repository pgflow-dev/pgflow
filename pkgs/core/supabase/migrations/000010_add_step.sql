CREATE OR REPLACE FUNCTION pgflow.add_step(
    flow_slug text,
    step_slug text,
    deps_slugs text []
)
RETURNS pgflow.steps
LANGUAGE sql
SET search_path TO ''
VOLATILE
AS $$
WITH
  ensure_flow AS (
    INSERT INTO pgflow.flows (flow_slug)
    VALUES (flow_slug)
    ON CONFLICT (flow_slug) DO NOTHING
    RETURNING flow_slug
  ),
  create_step AS (
    INSERT INTO pgflow.steps (flow_slug, step_slug)
    VALUES (flow_slug, step_slug)
    RETURNING *
  ),
  insert_deps AS (
    INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
    SELECT add_step.flow_slug, d.dep_slug, add_step.step_slug
    FROM unnest(deps_slugs) AS d(dep_slug)
    RETURNING 1
  )
-- Return the created step
SELECT * FROM create_step;
$$;
