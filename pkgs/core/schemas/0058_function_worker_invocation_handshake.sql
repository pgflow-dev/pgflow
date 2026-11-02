-- Validate every HTTP delivery, including deliveries to surviving runtimes.
-- A receipt never clears pending state. An existing healthy worker may finish
-- the handshake without registering a new worker or starting another loop.
create or replace function pgflow.reconcile_worker_invocation(
  function_name text,
  invocation_id uuid,
  worker_id uuid default null
) returns text
language plpgsql
as $$
declare
  registration pgflow.worker_functions%rowtype;
begin
  select wf.* into registration from pgflow.worker_functions as wf
  where wf.function_name = reconcile_worker_invocation.function_name
  for update;

  if not found or not registration.enabled or registration.start_mode <> 'http'
    or reconcile_worker_invocation.invocation_id is null
    or registration.invocation_id is distinct from reconcile_worker_invocation.invocation_id then
    return 'rejected';
  end if;

  if registration.invocation_status = 'pending'
    and registration.invocation_expires_at > clock_timestamp() then
    if reconcile_worker_invocation.worker_id is null then
      return 'pending';
    end if;
    if exists (
      select 1 from pgflow.workers as w
      where w.worker_id = reconcile_worker_invocation.worker_id
        and w.function_name = registration.function_name
        and w.stopped_at is null and w.deprecated_at is null
        and w.last_heartbeat_at > clock_timestamp() - registration.debounce
    ) then
      update pgflow.worker_functions as wf
      set invocation_status = 'ready', invocation_worker_id = reconcile_worker_invocation.worker_id
      where wf.function_name = registration.function_name;
      return 'ready';
    end if;
    return 'pending';
  elsif registration.invocation_status = 'ready'
    and registration.invocation_worker_id = reconcile_worker_invocation.worker_id
    and exists (
      select 1 from pgflow.workers as w
      where w.worker_id = reconcile_worker_invocation.worker_id
        and w.function_name = registration.function_name
        and w.stopped_at is null and w.deprecated_at is null
        and w.last_heartbeat_at > clock_timestamp() - registration.debounce
    ) then
    return 'ready';
  end if;

  return 'rejected';
end;
$$;

-- Called only after initialization completes, immediately before processing.
create or replace function pgflow.accept_worker_invocation(
  function_name text,
  invocation_id uuid,
  worker_id uuid,
  queue_name text,
  pgflow_version text
) returns setof pgflow.workers
language plpgsql
as $$
declare
  registration pgflow.worker_functions%rowtype;
begin
  select wf.* into registration from pgflow.worker_functions as wf
  where wf.function_name = accept_worker_invocation.function_name
  for update;

  if not found or not registration.enabled or registration.start_mode <> 'http'
    or accept_worker_invocation.invocation_id is null
    or registration.invocation_id is distinct from accept_worker_invocation.invocation_id then
    return;
  end if;

  -- A committed acceptance whose response was lost is safe to repeat only
  -- for that same healthy worker, never for a different runtime.
  if registration.invocation_status = 'ready'
    and registration.invocation_worker_id = accept_worker_invocation.worker_id then
    return query select w.* from pgflow.workers as w
    where w.worker_id = accept_worker_invocation.worker_id
      and w.function_name = registration.function_name
      and w.queue_name = accept_worker_invocation.queue_name
      and w.stopped_at is null and w.deprecated_at is null
      and w.last_heartbeat_at > clock_timestamp() - registration.debounce;
    return;
  end if;

  if registration.invocation_status is distinct from 'pending'
    or registration.invocation_expires_at is null
    or registration.invocation_expires_at <= clock_timestamp() then
    return;
  end if;

  return query
  insert into pgflow.workers (
    worker_id, function_name, queue_name, pgflow_version, started_at, last_heartbeat_at
  )
  values (accept_worker_invocation.worker_id, registration.function_name,
          accept_worker_invocation.queue_name, accept_worker_invocation.pgflow_version,
          clock_timestamp(), clock_timestamp())
  returning *;

  update pgflow.worker_functions as wf
  set invocation_status = 'ready', invocation_worker_id = accept_worker_invocation.worker_id
  where wf.function_name = registration.function_name;
end;
$$;

create or replace function pgflow.dismiss_worker_invocation(
  function_name text,
  invocation_id uuid,
  reason text
) returns boolean
language sql
as $$
  with dismissed as (
    update pgflow.worker_functions as wf
    set invocation_status = 'failed', invocation_error = left(dismiss_worker_invocation.reason, 2000)
    where wf.function_name = dismiss_worker_invocation.function_name
      and wf.invocation_id = dismiss_worker_invocation.invocation_id
      and wf.invocation_status = 'pending'
    returning 1
  )
  select exists (select 1 from dismissed);
$$;

comment on function pgflow.reconcile_worker_invocation(text, uuid, uuid) is
'Validates a startup delivery. Receipt returns pending without consuming it; a healthy existing worker
can acknowledge readiness. Old, expired, failed or superseded IDs are rejected.';

comment on function pgflow.accept_worker_invocation(text, uuid, uuid, text, text) is
'Atomically consumes a current pending invocation and registers its ready worker.
Idempotent for the accepted healthy worker; no lifetime ownership or task fencing.';

comment on function pgflow.dismiss_worker_invocation(text, uuid, text) is
'Makes only the matching pending invocation retryable after debounce;
cannot undo readiness or dismiss a newer invocation.';
