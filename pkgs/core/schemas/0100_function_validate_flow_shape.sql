-- Complete pre-mutation validation of a compiled flow shape (#650).
-- The compiler calls this before any definition change so a late invalid
-- step name cannot leave earlier queues/definitions behind.
create or replace function pgflow._validate_flow_shape(
  p_flow_slug text,
  p_shape jsonb
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_step jsonb;
  v_step_slug text;
  v_dep text;
  v_canonical_queue text := lower(p_flow_slug);
  v_conflict text;
begin
  if not pgflow.is_valid_slug(p_flow_slug) then
    raise exception 'Flow "%" is not a valid flow slug', p_flow_slug;
  end if;

  if jsonb_typeof(p_shape) is distinct from 'object'
     or jsonb_typeof(p_shape->'steps') is distinct from 'array' then
    raise exception 'Flow % requires a complete steps array', p_flow_slug;
  end if;

  -- Resolve all required canonical queue names before mutation: in #650 the
  -- complete required route is exactly the canonical default.
  if not pgflow._is_valid_queue_name(v_canonical_queue) then
    raise exception 'Flow % resolves to generated queue name "%" longer than the 47-character compatibility limit or otherwise invalid',
      p_flow_slug, v_canonical_queue;
  end if;

  -- Every step name satisfies the shared slug rules
  for v_step in select * from jsonb_array_elements(p_shape->'steps') loop
    v_step_slug := v_step->>'slug';

    if not pgflow.is_valid_slug(v_step_slug) then
      raise exception 'Flow % contains invalid step slug "%"', p_flow_slug, v_step_slug;
    end if;

    if jsonb_typeof(v_step->'dependencies') is distinct from 'array' then
      raise exception 'Flow % step "%" requires a dependencies array', p_flow_slug, v_step_slug;
    end if;

    -- Dependency names preserve exact spelling and satisfy the slug rules
    for v_dep in select * from jsonb_array_elements_text(v_step->'dependencies') loop
      if not pgflow.is_valid_slug(v_dep) then
        raise exception 'Flow % step "%" has invalid dependency slug "%"', p_flow_slug, v_step_slug, v_dep;
      end if;
    end loop;
  end loop;

  -- Case-only duplicate step identities inside the shape are rejected while
  -- exact spelling is preserved.
  select s1->>'slug' into v_conflict
  from jsonb_array_elements(p_shape->'steps') s1,
       jsonb_array_elements(p_shape->'steps') s2
  where lower(s1->>'slug') = lower(s2->>'slug')
    and s1->>'slug' <> s2->>'slug'
  limit 1;

  if v_conflict is not null then
    raise exception 'Flow % contains case-only duplicate step identities (first conflict: "%")',
      p_flow_slug, v_conflict;
  end if;
end;
$$;
