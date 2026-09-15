-- Create a new flow with optional configuration.
-- NULL parameters use defaults defined in the 'defaults' CTE below.
-- This allows callers to pass NULL to explicitly use the default value.
--
-- Queue provisioning (#650, #651): the default queue is the normalized slug
-- lower(flow_slug). Before creating a new flow, a listed PGMQ queue with the
-- same normalized name is rejected unless an existing flow with the same
-- normalized slug owns it (then the queue is reused as listed, keeping its
-- original spelling). pgflow never creates a second metadata entry just to
-- lowercase an existing queue name.
--
-- create_flow stays flow-only (#651): it provisions 'flow' queue mode and
-- the default queue. Step mode is provisioned exclusively by the
-- complete-route compilation path (ensure_flow_compiled ->
-- _create_flow_from_shape), so incremental definition calls cannot create
-- it. Calling create_flow again for an existing step-mode definition keeps
-- its mode and persisted step routes and never creates an unused default
-- queue for it.
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
declare
  v_flow pgflow.flows;
  v_existing_mode text;
begin
  -- Serialize with ensure_flow_compiled and every other definition writer on
  -- the same normalized flow identity (#651): concurrent compilation and
  -- incremental definition must not interleave queue checks and creates.
  -- Advisory xact locks re-enter freely in one transaction, so the
  -- _create_flow_from_shape path calling create_flow() under
  -- ensure_flow_compiled's lock cannot self-deadlock. The lock is taken
  -- before any table or queue access.
  perform pg_advisory_xact_lock(1, hashtext(lower(create_flow.flow_slug)));

  if not exists (
    select 1
    from pgflow.flows as flow
    where lower(flow.flow_slug) = lower(create_flow.flow_slug)
  ) and exists (
    select 1
    from pgmq.list_queues() as listed
    where lower(listed.queue_name) = lower(create_flow.flow_slug)
  ) then
    raise exception
      'cannot create flow "%": queue "%" is already in use by another owner',
      create_flow.flow_slug, lower(create_flow.flow_slug)
      using errcode = 'unique_violation';
  end if;

  select flow.queue_mode into v_existing_mode
  from pgflow.flows as flow
  where flow.flow_slug = create_flow.flow_slug;

  insert into pgflow.flows (flow_slug, opt_max_attempts, opt_base_delay, opt_timeout)
  values (
    create_flow.flow_slug,
    coalesce(max_attempts, 3),
    coalesce(base_delay, 5),
    coalesce(timeout, 60)
  )
  on conflict on constraint flows_pkey
  do update
  set flow_slug = pgflow.flows.flow_slug -- Dummy update
  returning * into v_flow;

  -- Ensure the default queue exists, including for an empty flow. Reuse the
  -- listed queue when it exists under any spelling of the normalized name.
  -- An existing step-mode definition owns no default queue: never create an
  -- unused one for it (#651).
  if coalesce(v_existing_mode, 'flow') = 'flow' then
    if not exists (
      select 1
      from pgmq.list_queues() as listed
      where lower(listed.queue_name) = lower(create_flow.flow_slug)
    ) then
      perform pgmq.create(lower(create_flow.flow_slug));
    end if;
  end if;

  return v_flow;
end;
$$;
