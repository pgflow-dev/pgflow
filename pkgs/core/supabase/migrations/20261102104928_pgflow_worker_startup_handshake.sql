-- Modify "worker_functions" table
ALTER TABLE "pgflow"."worker_functions" ADD CONSTRAINT "worker_functions_invocation_status_check" CHECK (invocation_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text])), ADD COLUMN "invocation_id" uuid NULL, ADD COLUMN "invocation_expires_at" timestamptz NULL, ADD COLUMN "invocation_status" text NULL, ADD COLUMN "invocation_worker_id" uuid NULL, ADD COLUMN "invocation_error" text NULL;
-- Set comment to column: "last_invoked_at" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."last_invoked_at" IS 'When startup was last reserved (retry throttle, not a readiness signal)';
-- Set comment to column: "invocation_id" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."invocation_id" IS 'Current startup handshake ID; retained after readiness or failure for idempotent reconciliation';
-- Set comment to column: "invocation_expires_at" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."invocation_expires_at" IS 'Database-clock deadline for pending startup. An expired pending invocation is retryable';
-- Set comment to column: "invocation_status" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."invocation_status" IS 'pending: awaiting readiness; ready: handshake completed, not worker lifetime; failed: retryable after debounce';
-- Set comment to column: "invocation_worker_id" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."invocation_worker_id" IS 'Worker that completed the current startup handshake';
-- Set comment to column: "invocation_error" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."invocation_error" IS 'Reason the current startup handshake failed, if explicitly dismissed';
-- Create "reserve_worker_invocation" function
CREATE FUNCTION "pgflow"."reserve_worker_invocation" ("function_name" text) RETURNS uuid LANGUAGE sql AS $$
with
    -- Lock the registration row only when it is eligible: enabled, HTTP-started,
    -- past debounce, with no unexpired pending invocation and no healthy worker.
    -- Concurrent reservations re-check eligibility under the row lock, so at most
    -- one current pending invocation can exist per function.
    eligible as (
      select wf.function_name
      from pgflow.worker_functions as wf
      where wf.function_name = reserve_worker_invocation.function_name
        and wf.enabled
        and wf.start_mode = 'http'
        and (
          wf.invocation_status is distinct from 'pending'
          or wf.invocation_expires_at is null
          or wf.invocation_expires_at <= clock_timestamp()
        )
        and (
          wf.last_invoked_at is null
          or wf.last_invoked_at <= clock_timestamp() - wf.debounce
        )
        and not exists (
          select 1 from pgflow.workers as w
          where w.function_name = wf.function_name
            and w.stopped_at is null
            and w.deprecated_at is null
            and w.last_heartbeat_at > clock_timestamp() - wf.debounce
        )
      for update
    ),
    reserved as (
      update pgflow.worker_functions as wf
      set invocation_id = gen_random_uuid(),
          invocation_expires_at = clock_timestamp() + interval '60 seconds',
          invocation_status = 'pending',
          invocation_worker_id = null,
          invocation_error = null,
          last_invoked_at = clock_timestamp()
      from eligible as e
      where wf.function_name = e.function_name
      returning wf.invocation_id
    )
  select invocation_id from reserved;
$$;
-- Set comment to function: "reserve_worker_invocation"
COMMENT ON FUNCTION "pgflow"."reserve_worker_invocation" IS 'Reserves one pending HTTP startup for 60 seconds under a per-function row lock.
Shared by cron and manual startup; returns NULL while healthy, pending, disabled, process-started or debounced.';
-- Modify "ensure_workers" function
CREATE OR REPLACE FUNCTION "pgflow"."ensure_workers" () RETURNS TABLE ("function_name" text, "invoked" boolean, "request_id" bigint) LANGUAGE sql AS $$
with
    -- Local development targets Kong directly without auth; production
    -- resolves the project URL and service credentials from Vault.
    env as materialized (
      select pgflow.is_local() as is_local
    ),
    credentials as materialized (
      select
        case when e.is_local then null else coalesce(
          nullif((select decrypted_secret from vault.decrypted_secrets where name = 'pgflow_auth_secret'), ''),
          nullif((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'), '')
        ) end as service_role_key,
        case when e.is_local then 'http://kong:8000/functions/v1' else (
          select 'https://' || nullif(decrypted_secret, '') || '.supabase.co/functions/v1'
          from vault.decrypted_secrets where name = 'supabase_project_id'
        ) end as base_url,
        e.is_local
      from env as e
    ),
    -- One reservation per eligible function; unreserved functions send nothing.
    reservations as materialized (
      select wf.function_name, c.base_url, c.service_role_key, c.is_local,
             pgflow.reserve_worker_invocation(wf.function_name) as invocation_id
      from pgflow.worker_functions as wf
      cross join credentials as c
      where wf.enabled and wf.start_mode = 'http'
        and c.base_url is not null
        and (c.is_local or c.service_role_key is not null)
      -- Concurrent cron transactions acquire registration locks in one order.
      order by wf.function_name
    )
  -- pg_net delivers asynchronously after this transaction commits.
  select r.function_name, true,
    net.http_post(
      url => r.base_url || '/' || r.function_name,
      headers => case when r.is_local then '{"Content-Type":"application/json"}'::jsonb
        else jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || r.service_role_key
        ) end,
      body => jsonb_build_object('invocation_id', r.invocation_id),
      timeout_milliseconds => 60000
    )
  from reservations as r
  where r.invocation_id is not null;
$$;
-- Set comment to function: "ensure_workers"
COMMENT ON FUNCTION "pgflow"."ensure_workers" IS 'Enqueues HTTP startup only when no healthy worker or unexpired pending invocation exists.
Reservations last 60 seconds; debounce throttles retries. Local development uses the same handshake
with local URL/auth fallbacks. Credentials: Vault pgflow_auth_secret, falling back to
supabase_service_role_key, and supabase_project_id. Returns the pg_net request_id;
handshake state is in worker_functions.';
-- Create "accept_worker_invocation" function
CREATE FUNCTION "pgflow"."accept_worker_invocation" ("function_name" text, "invocation_id" uuid, "worker_id" uuid, "queue_name" text, "pgflow_version" text) RETURNS SETOF "pgflow"."workers" LANGUAGE plpgsql AS $$
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
-- Set comment to function: "accept_worker_invocation"
COMMENT ON FUNCTION "pgflow"."accept_worker_invocation" IS 'Atomically consumes a current pending invocation and registers its ready worker.
Idempotent for the accepted healthy worker; no lifetime ownership or task fencing.';
-- Create "dismiss_worker_invocation" function
CREATE FUNCTION "pgflow"."dismiss_worker_invocation" ("function_name" text, "invocation_id" uuid, "reason" text) RETURNS boolean LANGUAGE sql AS $$
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
-- Set comment to function: "dismiss_worker_invocation"
COMMENT ON FUNCTION "pgflow"."dismiss_worker_invocation" IS 'Makes only the matching pending invocation retryable after debounce;
cannot undo readiness or dismiss a newer invocation.';
-- Create "reconcile_worker_invocation" function
CREATE FUNCTION "pgflow"."reconcile_worker_invocation" ("function_name" text, "invocation_id" uuid, "worker_id" uuid DEFAULT NULL::uuid) RETURNS text LANGUAGE plpgsql AS $$
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
-- Set comment to function: "reconcile_worker_invocation"
COMMENT ON FUNCTION "pgflow"."reconcile_worker_invocation" IS 'Validates a startup delivery. Receipt returns pending without consuming it; a healthy existing worker
can acknowledge readiness. Old, expired, failed or superseded IDs are rejected.';
