-- Modify "add_step" function
CREATE OR REPLACE FUNCTION "pgflow"."add_step" ("flow_slug" text, "step_slug" text, "deps_slugs" text[], "max_attempts" integer DEFAULT NULL::integer, "base_delay" integer DEFAULT NULL::integer, "timeout" integer DEFAULT NULL::integer, "step_type" text DEFAULT 'single') RETURNS "pgflow"."steps" LANGUAGE plpgsql SET "search_path" = '' AS $$
begin
  -- Validate fanout constraints
  if add_step.step_type = 'fanout' then
    if array_length(add_step.deps_slugs, 1) != 1 then
      raise exception 'Fanout steps must have exactly one dependency';
    end if;
    if array_length(add_step.deps_slugs, 1) is null then
      raise exception 'Fanout steps cannot be root steps';
    end if;
  end if;

  return (
    WITH
      next_index AS (
        SELECT COALESCE(MAX(step_index) + 1, 0) as idx
        FROM pgflow.steps s
        WHERE s.flow_slug = add_step.flow_slug
      ),
      create_step AS (
        INSERT INTO pgflow.steps (flow_slug, step_slug, step_index, deps_count, opt_max_attempts, opt_base_delay, opt_timeout, step_type)
        SELECT add_step.flow_slug, add_step.step_slug, idx, COALESCE(array_length(add_step.deps_slugs, 1), 0), add_step.max_attempts, add_step.base_delay, add_step.timeout, add_step.step_type
        FROM next_index
        ON CONFLICT (flow_slug, step_slug)
        DO UPDATE SET step_slug = pgflow.steps.step_slug
        RETURNING *
      ),
      insert_deps AS (
        INSERT INTO pgflow.deps (flow_slug, dep_slug, step_slug)
        SELECT add_step.flow_slug, d.dep_slug, add_step.step_slug
        FROM unnest(add_step.deps_slugs) AS d(dep_slug)
        ON CONFLICT (flow_slug, dep_slug, step_slug) DO NOTHING
        RETURNING 1
      )
    -- Return the created step
    SELECT * FROM create_step
  );
end;
$$;
