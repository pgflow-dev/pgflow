create or replace function pgflow.add_step(
  flow_slug text,
  step_slug text,
  deps_slugs text [],
  max_attempts int default null,
  base_delay int default null,
  timeout int default null
)
returns pgflow.steps
language sql
set search_path to ''
volatile
as $$
WITH
  next_index AS (
    SELECT COALESCE(MAX(step_index) + 1, 0) as idx
    FROM pgflow.steps
    WHERE flow_slug = add_step.flow_slug
  ),
  create_step AS (
    INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count, opt_max_attempts, opt_base_delay, opt_timeout)
    SELECT add_step.flow_slug, add_step.step_slug, idx, COALESCE(array_length(deps_slugs, 1), 0), max_attempts, base_delay, timeout
    FROM next_index
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
  max_attempts int default null,
  base_delay int default null,
  timeout int default null
)
returns pgflow.steps
language sql
set search_path to ''
volatile
as $$
    -- Call the original function with an empty array
    SELECT * FROM pgflow.add_step(flow_slug, step_slug, ARRAY[]::text[], max_attempts, base_delay, timeout);
$$;
