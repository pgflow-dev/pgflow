-- Create a new flow definition with optional configuration.
-- NULL parameters use defaults defined below; callers may pass NULL to
-- explicitly use the default value.
--
-- Definition-only (#650): this function performs no queue DDL. The generated
-- default queue is provisioned by add_step()/_create_flow_from_shape() through
-- the shared generated-queue path.
create or replace function pgflow.create_flow(
  flow_slug text,
  max_attempts int default null,
  base_delay int default null,
  timeout int default null
)
returns pgflow.flows
language plpgsql
volatile
set search_path = ''
as $$
#variable_conflict use_column
declare
  result_flow pgflow.flows;
  v_alias_slug text;
begin
  -- Canonical advisory lock: case aliases share the lock so concurrent
  -- compilation cannot create both spellings.
  perform pg_advisory_xact_lock(1, hashtext(lower(create_flow.flow_slug)));

  -- Precheck case aliases before the unique index does; the message names
  -- both exact spellings.
  select f.flow_slug into v_alias_slug
  from pgflow.flows f
  where lower(f.flow_slug) = lower(create_flow.flow_slug)
    and f.flow_slug <> create_flow.flow_slug
  limit 1;

  if v_alias_slug is not null then
    raise sqlstate '23505' using message = format(
      'Flow "%s" conflicts with existing flow "%s" (case-insensitive flow namespace)',
      create_flow.flow_slug, v_alias_slug
    );
  end if;

  if not exists (select 1 from pgflow.flows f where f.flow_slug = create_flow.flow_slug) then
    -- New identity: the canonical generated route must be genuinely absent so
    -- create_flow cannot launder an external queue into apparent ownership
    -- before add_step() runs. The inspection takes the pgmq.meta fence.
    perform pgflow._inspect_generated_queue(
      create_flow.flow_slug,
      lower(create_flow.flow_slug),
      false
    );
  end if;

  insert into pgflow.flows as flow (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
  values (
    create_flow.flow_slug,
    coalesce(max_attempts, 3),
    coalesce(base_delay, 5),
    coalesce(timeout, 60)
  )
  on conflict (flow_slug) do update
  set flow_slug = flow.flow_slug -- Dummy update: idempotent
  returning * into result_flow;

  return result_flow;
end;
$$;
