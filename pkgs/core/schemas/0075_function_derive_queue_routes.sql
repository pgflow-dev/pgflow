-- Derive the complete ordered queue route map from a shape and a queue
-- mode (#651). This is the one canonical derivation: startup compilation is
-- authoritative and callers may only supply a map that matches it exactly.
--
-- Returns an ordered jsonb array [{stepSlug, queueName}] by shape
-- ordinality (zero-based step_index). In 'step' mode every name is resolved
-- through _resolve_step_queue_name, validated with the installed
-- pgmq.validate_queue_name(), and checked for duplicates. In 'flow' mode
-- every step routes to lower(flow_slug).
create or replace function pgflow._derive_queue_routes(
  p_flow_slug text,
  p_shape jsonb,
  p_queue_mode text
)
returns jsonb
language plpgsql
-- Volatile like the pgmq.validate_queue_name() call it performs: an
-- IMMUTABLE label on a function that runs PGMQ validation would mislead
-- the planner about what the call can do.
volatile
set search_path = ''
as $$
declare
  v_step jsonb;
  v_step_slug text;
  v_step_index int;
  v_queue_name text;
  v_routes jsonb := '[]'::jsonb;
  v_seen_normalized_steps text[] := '{}';
  v_seen_step_slugs text[] := '{}';
  v_seen_queues text[] := '{}';
  v_seen_queue_steps text[] := '{}';
begin
  if p_queue_mode not in ('flow', 'step') then
    raise exception 'Unknown queue mode "%".', p_queue_mode
      using hint = 'Queue mode must be ''flow'' or ''step''.';
  end if;

  if p_queue_mode = 'step' and jsonb_array_length(coalesce(p_shape->'steps', '[]'::jsonb)) = 0 then
    raise exception
      'Flow "%" cannot use per-step queues: it has no steps.',
      p_flow_slug
      using detail = 'Per-step queue mode requires at least one step.',
      hint = 'Add a step or keep the flow on the default single queue.';
  end if;

  -- Validate the concrete flow slug and every step slug before route
  -- resolution, collision checks, or PGMQ work: an invalid slug is a
  -- definition error that outranks every queue concern, so a shape with
  -- both problems reports the slug, not the queue.
  if not pgflow.is_valid_slug(p_flow_slug) then
    raise exception
      'Flow slug "%" is not valid.',
      p_flow_slug
      using detail = 'Slugs are 1-128 characters of letters, digits, and single underscores, must start with a letter, cannot end with an underscore, cannot contain ''__'', and cannot be the reserved word ''run''.',
      hint = 'Fix the flow slug in the flow definition.';
  end if;

  for v_step in select * from jsonb_array_elements(coalesce(p_shape->'steps', '[]'::jsonb))
  loop
    v_step_slug := v_step->>'slug';

    if not pgflow.is_valid_slug(v_step_slug) then
      raise exception
        'Step slug "%" in flow "%" is not valid.',
        v_step_slug, p_flow_slug
        using detail = 'Slugs are 1-128 characters of letters, digits, and single underscores, must start with a letter, cannot end with an underscore, cannot contain ''__'', and cannot be the reserved word ''run''.',
        hint = 'Fix the step slug in the flow definition.';
    end if;
  end loop;

  for v_step in select * from jsonb_array_elements(coalesce(p_shape->'steps', '[]'::jsonb))
  loop
    v_step_slug := v_step->>'slug';
    v_step_index := jsonb_array_length(v_routes);

    -- Validate normalized step identity before route resolution. Long
    -- case-only variants can resolve to distinct index fallbacks, so route
    -- collisions alone cannot detect this invalid definition.
    if lower(v_step_slug) = any(v_seen_normalized_steps) then
      raise exception
        'Steps "%" and "%" in flow "%" conflict case-insensitively.',
        v_seen_step_slugs[array_position(v_seen_normalized_steps, lower(v_step_slug))],
        v_step_slug,
        p_flow_slug
        using detail = 'Step slugs must be unique case-insensitively.',
        hint = 'Rename one of the colliding steps.';
    end if;
    v_seen_normalized_steps := v_seen_normalized_steps || lower(v_step_slug);
    v_seen_step_slugs := v_seen_step_slugs || v_step_slug;

    if p_queue_mode = 'step' then
      v_queue_name := pgflow._resolve_step_queue_name(p_flow_slug, v_step_slug, v_step_index);
      perform pgmq.validate_queue_name(v_queue_name);
    else
      v_queue_name := lower(p_flow_slug);
    end if;

    if p_queue_mode = 'step' and v_queue_name = any(v_seen_queues) then
      raise exception
        'Steps "%" and "%" in flow "%" both resolve to queue "%".',
        v_seen_queue_steps[array_position(v_seen_queues, v_queue_name)], v_step_slug, p_flow_slug, v_queue_name
        using detail = 'Generated queue names must be unique per flow.',
        hint = 'Step slugs must be unique case-insensitively; rename one of the colliding steps.';
    end if;

    v_seen_queues := v_seen_queues || v_queue_name;
    v_seen_queue_steps := v_seen_queue_steps || v_step_slug;
    v_routes := v_routes || jsonb_build_object('stepSlug', v_step_slug, 'queueName', v_queue_name);
  end loop;

  return v_routes;
end;
$$;
