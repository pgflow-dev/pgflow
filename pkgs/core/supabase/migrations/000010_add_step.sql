create or replace function pgflow.add_step(
  flow_slug text,
  step_slug text,
  deps_slugs text [],
  retry_limit int default null,
  retry_delay int default null
)
returns pgflow.steps
language sql
set search_path to ''
volatile
as $$
WITH
  create_step AS (
    INSERT INTO pgflow.steps (flow_slug, step_slug, deps_count, retry_limit, retry_delay)
    VALUES (flow_slug, step_slug, COALESCE(array_length(deps_slugs, 1), 0), retrylimit, retry_delay)
    ON CONFLICT (flow_slug, step_slug) 
    DO UPDATE SET step_slug = pgflow.steps.step_slug
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
create or replace function pgflow.add_step(
  flow_slug text,
  step_slug text,
  retry_limit int default null,
  retry_delay int default null
)
returns pgflow.steps
language sql
set search_path to ''
volatile
as $$
    -- Call the original function with an empty array
    SELECT * FROM pgflow.add_step(flow_slug, step_slug, ARRAY[]::text[], retry_limit, retry_delay);
$$;
