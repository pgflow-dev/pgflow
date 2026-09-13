-- Create a new flow with optional configuration.
-- NULL parameters use defaults defined in the 'defaults' CTE below.
-- This allows callers to pass NULL to explicitly use the default value.
--
-- Queue provisioning (#650): the flow's default queue is the normalized slug
-- lower(flow_slug). Before creating a new flow, a listed PGMQ queue with the
-- same normalized name is rejected unless an existing flow with the same
-- normalized slug owns it (then the queue is reused as listed, keeping its
-- original spelling). pgflow never creates a second metadata entry just to
-- lowercase an existing queue name.
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
begin
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
  if not exists (
    select 1
    from pgmq.list_queues() as listed
    where lower(listed.queue_name) = lower(create_flow.flow_slug)
  ) then
    perform pgmq.create(lower(create_flow.flow_slug));
  end if;

  return v_flow;
end;
$$;
