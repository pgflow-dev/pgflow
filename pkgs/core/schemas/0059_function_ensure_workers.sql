-- Reserve and enqueue in the same transaction: delivery cannot precede the
-- committed pending state, and enqueue failure rolls the reservation back.
-- Startup eligibility (debounce, pending state, healthy workers) lives in
-- pgflow.reserve_worker_invocations, shared with manual startup.
create or replace function pgflow.ensure_workers()
returns table (function_name text, invoked boolean, request_id bigint)
language sql
as $$
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
    targets as materialized (
      select c.*, array(
        select wf.function_name from pgflow.worker_functions as wf
        where wf.enabled and wf.start_mode = 'http'
      ) as function_names
      from credentials as c
      where c.base_url is not null and (c.is_local or c.service_role_key is not null)
    ),
    reservations as materialized (
      select r.function_name, r.invocation_id, t.base_url, t.service_role_key, t.is_local
      from targets as t
      cross join lateral pgflow.reserve_worker_invocations(function_names => t.function_names) as r
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
  from reservations as r;
$$;

comment on function pgflow.ensure_workers() is
'Enqueues HTTP startup only when no healthy worker or unexpired pending invocation exists.
Reservations last 60 seconds; debounce throttles retries. Local development uses the same handshake
with local URL/auth fallbacks. Credentials: Vault pgflow_auth_secret, falling back to
supabase_service_role_key, and supabase_project_id. Returns the pg_net request_id;
handshake state is in worker_functions.';
