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
  create_step AS (
    INSERT INTO pgflow.steps (flow_slug, step_slug)
    VALUES (flow_slug, step_slug)
    ON CONFLICT (flow_slug, step_slug) DO NOTHING
    RETURNING *
  ),
  insert_deps AS (
    INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
    SELECT add_step.flow_slug, d.dep_slug, add_step.step_slug
    FROM unnest(deps_slugs) AS d(dep_slug)
    ON CONFLICT (flow_slug, dep_slug, step_slug) DO NOTHING
    RETURNING 1
  )
-- Return the created step
SELECT * FROM create_step;
$$;

-- New overloaded function without deps_slugs parameter
CREATE OR REPLACE FUNCTION pgflow.add_step(
    flow_slug text,
    step_slug text
)
RETURNS pgflow.steps
LANGUAGE sql
SET search_path TO ''
VOLATILE
AS $$
    -- Call the original function with an empty array
    SELECT * FROM pgflow.add_step(flow_slug, step_slug, ARRAY[]::text[]);
$$;
