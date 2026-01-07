-- Modify "ensure_workers" function
CREATE OR REPLACE FUNCTION "pgflow"."ensure_workers" () RETURNS TABLE ("function_name" text, "invoked" boolean, "request_id" bigint) LANGUAGE sql AS $$
with
    -- Detect environment
    env as (
      select pgflow.is_local() as is_local
    ),

    -- Get credentials: Local mode uses hardcoded URL, production uses vault secrets
    -- Empty strings are treated as NULL using nullif()
    -- pgflow_auth_secret takes priority over supabase_service_role_key for production auth
    credentials as (
      select
        case
          when (select is_local from env) then null
          else coalesce(
            nullif((select decrypted_secret from vault.decrypted_secrets where name = 'pgflow_auth_secret'), ''),
            nullif((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'), '')
          )
        end as service_role_key,
        case
          when (select is_local from env) then 'http://kong:8000/functions/v1'
          else (select 'https://' || nullif(decrypted_secret, '') || '.supabase.co/functions/v1' from vault.decrypted_secrets where name = 'supabase_project_id')
        end as base_url
    ),

    -- Find functions that pass the debounce check
    debounce_passed as (
      select wf.function_name, wf.debounce
      from pgflow.worker_functions as wf
      where wf.enabled = true
        and (
          wf.last_invoked_at is null
          or wf.last_invoked_at < now() - wf.debounce
        )
    ),

    -- Find functions that have at least one alive worker
    functions_with_alive_workers as (
      select distinct w.function_name
      from pgflow.workers as w
      inner join debounce_passed as dp on w.function_name = dp.function_name
      where w.stopped_at is null
        and w.deprecated_at is null
        and w.last_heartbeat_at > now() - dp.debounce
    ),

    -- Determine which functions should be invoked
    -- Local mode: all enabled functions (bypass debounce AND alive workers check)
    -- Production mode: only functions that pass debounce AND have no alive workers
    functions_to_invoke as (
      select wf.function_name
      from pgflow.worker_functions as wf
      where wf.enabled = true
        and (
          pgflow.is_local() = true  -- Local: all enabled functions
          or (
            -- Production: debounce + no alive workers
            wf.function_name in (select dp.function_name from debounce_passed as dp)
            and wf.function_name not in (select faw.function_name from functions_with_alive_workers as faw)
          )
        )
    ),

    -- Make HTTP requests and capture request_ids
    http_requests as (
      select
        fti.function_name,
        net.http_post(
          url => c.base_url || '/' || fti.function_name,
          headers => case
            when e.is_local then '{}'::jsonb
            else jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || c.service_role_key
            )
          end,
          body => '{}'::jsonb
        ) as request_id
      from functions_to_invoke as fti
      cross join credentials as c
      cross join env as e
      where c.base_url is not null
        and (e.is_local or c.service_role_key is not null)
    ),

    -- Update last_invoked_at for invoked functions
    updated as (
      update pgflow.worker_functions as wf
      set last_invoked_at = clock_timestamp()
      from http_requests as hr
      where wf.function_name = hr.function_name
      returning wf.function_name
    )

  select u.function_name, true as invoked, hr.request_id
  from updated as u
  inner join http_requests as hr on u.function_name = hr.function_name
$$;
-- Set comment to function: "ensure_workers"
COMMENT ON FUNCTION "pgflow"."ensure_workers" IS 'Ensures worker functions are running by pinging them via HTTP when needed.
In local mode: pings ALL enabled functions (ignores debounce AND alive workers check).
In production mode: only pings functions that pass debounce AND have no alive workers.
Debounce: skips functions pinged within their debounce interval (production only).
Credentials: Uses Vault secrets (pgflow_auth_secret with fallback to supabase_service_role_key, supabase_project_id) or local fallbacks.
URL is built from project_id: https://{project_id}.supabase.co/functions/v1
Returns request_id from pg_net for each HTTP request made.';
