-- Shared step-queue route preflight (#651): one canonical ownership and
-- listing check for every step-mode queue name, so startup verification and
-- creation cannot diverge.
--
-- Callers must already hold the normalized-flow advisory lock
-- (pg_advisory_xact_lock(1, hashtext(lower(flow_slug)))).
--
-- Rejects:
-- - a queue name routed to by another concrete flow's steps, or defaulted
--   to by another flow-mode flow (cross-flow reference);
-- - an ambiguous case-insensitive match among listed PGMQ queues
--   (external damage), even when this flow's definition owns the route.
--
-- Allows one exact listed queue only when the existing definition of this
-- exact flow owns that route (idempotent reuse). A name that is neither
-- listed nor owned is left for the caller to create.
--
-- Returns true when the caller must create the queue.
create or replace function pgflow._assert_step_queue_available(
  p_flow_slug text,
  p_queue_name text
)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_owner_flow_slug text;
  v_listed text[];
begin
  -- A name derived or referenced by another concrete flow is rejected
  select s.flow_slug into v_owner_flow_slug
  from pgflow.steps as s
  where s.queue_name = p_queue_name
    and lower(s.flow_slug) <> lower(p_flow_slug)
  limit 1;

  if v_owner_flow_slug is null then
    select f.flow_slug into v_owner_flow_slug
    from pgflow.flows as f
    where f.queue_mode = 'flow'
      and lower(f.flow_slug) = p_queue_name
      and lower(f.flow_slug) <> lower(p_flow_slug)
    limit 1;
  end if;

  if v_owner_flow_slug is not null then
    raise exception
      'cannot create flow "%": queue "%" is already used by another flow ("%")',
      p_flow_slug, p_queue_name, v_owner_flow_slug
      using detail = 'Generated per-step queue names must belong to exactly one concrete flow.',
      hint = 'Use a different concrete flow slug, or drop the conflicting definition.';
  end if;

  -- Ambiguous normalized matches among listed queues are external damage
  select array_agg(listed.queue_name order by listed.queue_name)
  into v_listed
  from pgmq.list_queues() as listed
  where lower(listed.queue_name) = p_queue_name;

  if v_listed is not null and cardinality(v_listed) > 1 then
    raise exception
      'queue "%" matches multiple listed PGMQ queues (%)',
      p_queue_name, v_listed
      using detail = 'An ambiguous case-insensitive match is external damage.',
      hint = 'Resolve the duplicate queue spellings manually, then retry.';
  end if;

  -- Owned by an existing definition of this exact flow: reuse idempotently.
  -- A verified definition owns every derived route, so its one exact listed
  -- queue is allowed here.
  if exists (
    select 1 from pgflow.steps as s
    where s.flow_slug = p_flow_slug and s.queue_name = p_queue_name
  ) then
    return false;
  end if;

  if v_listed is not null then
    raise exception
      'cannot create flow "%": queue "%" is already listed in PGMQ and not owned by this flow',
      p_flow_slug, p_queue_name
      using detail = 'A missing definition must not adopt an already listed queue.',
      hint = 'Drop the conflicting queue or use a different concrete flow slug.';
  end if;

  return true;
end;
$$;
