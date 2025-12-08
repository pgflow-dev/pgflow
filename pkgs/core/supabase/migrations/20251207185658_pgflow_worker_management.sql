-- Create extension "pg_net"
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";
-- Create extension "pg_cron"
CREATE EXTENSION IF NOT EXISTS "pg_cron";
-- Modify "workers" table
ALTER TABLE "pgflow"."workers" ADD COLUMN "stopped_at" timestamptz NULL;
-- Create "worker_functions" table
CREATE TABLE "pgflow"."worker_functions" (
  "function_name" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "heartbeat_timeout_seconds" integer NOT NULL DEFAULT 6,
  "last_invoked_at" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("function_name")
);
-- Set comment to table: "worker_functions"
COMMENT ON TABLE "pgflow"."worker_functions" IS 'Registry of edge functions that run pgflow workers, used by ensure_workers() cron';
-- Set comment to column: "function_name" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."function_name" IS 'Name of the Supabase Edge Function';
-- Set comment to column: "enabled" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."enabled" IS 'Whether ensure_workers() should ping this function';
-- Set comment to column: "heartbeat_timeout_seconds" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."heartbeat_timeout_seconds" IS 'How long before considering a worker dead (no heartbeat)';
-- Set comment to column: "last_invoked_at" on table: "worker_functions"
COMMENT ON COLUMN "pgflow"."worker_functions"."last_invoked_at" IS 'When ensure_workers() last pinged this function (used for debouncing)';
-- Create "cleanup_ensure_workers_logs" function
CREATE FUNCTION "pgflow"."cleanup_ensure_workers_logs" ("retention_hours" integer DEFAULT 24) RETURNS TABLE ("cron_deleted" bigint) LANGUAGE sql SECURITY DEFINER SET "search_path" = pgflow, cron, pg_temp AS $$
with deleted as (
    delete from cron.job_run_details
    where job_run_details.end_time < now() - (cleanup_ensure_workers_logs.retention_hours || ' hours')::interval
    returning 1
  )
  select count(*)::bigint as cron_deleted from deleted
$$;
-- Set comment to function: "cleanup_ensure_workers_logs"
COMMENT ON FUNCTION "pgflow"."cleanup_ensure_workers_logs" IS 'Cleans up old cron job run details to prevent table growth.
Default retention is 24 hours. HTTP response logs (net._http_response) are
automatically cleaned by pg_net with a 6-hour TTL, so they are not cleaned here.
This function follows the standard pg_cron maintenance pattern recommended by
AWS RDS, Neon, and Supabase documentation.';
-- Create "is_local" function
CREATE FUNCTION "pgflow"."is_local" () RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE SET "search_path" = '' AS $$
select coalesce(
    current_setting('app.settings.jwt_secret', true)
      = 'super-secret-jwt-token-with-at-least-32-characters-long',
    false
  )
$$;
-- Create "ensure_flow_compiled" function
CREATE FUNCTION "pgflow"."ensure_flow_compiled" ("flow_slug" text, "shape" jsonb) RETURNS jsonb LANGUAGE plpgsql SET "search_path" = '' AS $$
DECLARE
  v_lock_key int;
  v_flow_exists boolean;
  v_db_shape jsonb;
  v_differences text[];
  v_is_local boolean;
BEGIN
  -- Generate lock key from flow_slug (deterministic hash)
  v_lock_key := hashtext(ensure_flow_compiled.flow_slug);

  -- Acquire transaction-level advisory lock
  -- Serializes concurrent compilation attempts for same flow
  PERFORM pg_advisory_xact_lock(1, v_lock_key);

  -- 1. Check if flow exists
  SELECT EXISTS(SELECT 1 FROM pgflow.flows AS flow WHERE flow.flow_slug = ensure_flow_compiled.flow_slug)
  INTO v_flow_exists;

  -- 2. If flow missing: compile (both environments)
  IF NOT v_flow_exists THEN
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object('status', 'compiled', 'differences', '[]'::jsonb);
  END IF;

  -- 3. Get current shape from DB
  v_db_shape := pgflow._get_flow_shape(ensure_flow_compiled.flow_slug);

  -- 4. Compare shapes
  v_differences := pgflow._compare_flow_shapes(ensure_flow_compiled.shape, v_db_shape);

  -- 5. If shapes match: return verified
  IF array_length(v_differences, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'verified', 'differences', '[]'::jsonb);
  END IF;

  -- 6. Shapes differ - auto-detect environment via is_local()
  v_is_local := pgflow.is_local();

  IF v_is_local THEN
    -- Recompile in local/dev: full deletion + fresh compile
    PERFORM pgflow.delete_flow_and_data(ensure_flow_compiled.flow_slug);
    PERFORM pgflow._create_flow_from_shape(ensure_flow_compiled.flow_slug, ensure_flow_compiled.shape);
    RETURN jsonb_build_object('status', 'recompiled', 'differences', to_jsonb(v_differences));
  ELSE
    -- Fail in production
    RETURN jsonb_build_object('status', 'mismatch', 'differences', to_jsonb(v_differences));
  END IF;
END;
$$;
-- Create "ensure_workers" function
CREATE FUNCTION "pgflow"."ensure_workers" () RETURNS TABLE ("function_name" text, "invoked" boolean, "request_id" bigint) LANGUAGE sql AS $$
with
    -- Detect environment
    env as (
      select pgflow.is_local() as is_local
    ),

    -- Get credentials: Vault secrets with local fallback for base_url only
    credentials as (
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'pgflow_service_role_key') as service_role_key,
        coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'pgflow_function_base_url'),
          case when (select is_local from env) then 'http://kong:8000/functions/v1' end
        ) as base_url
    ),

    -- Find functions that pass the debounce check
    debounce_passed as (
      select wf.function_name, wf.heartbeat_timeout_seconds
      from pgflow.worker_functions as wf
      where wf.enabled = true
        and (
          wf.last_invoked_at is null
          or wf.last_invoked_at < now() - (wf.heartbeat_timeout_seconds || ' seconds')::interval
        )
    ),

    -- Find functions that have at least one alive worker
    functions_with_alive_workers as (
      select distinct w.function_name
      from pgflow.workers as w
      inner join debounce_passed as dp on w.function_name = dp.function_name
      where w.stopped_at is null
        and w.deprecated_at is null
        and w.last_heartbeat_at > now() - (dp.heartbeat_timeout_seconds || ' seconds')::interval
    ),

    -- Determine which functions should be invoked
    functions_to_invoke as (
      select dp.function_name
      from debounce_passed as dp
      where
        pgflow.is_local() = true
        or dp.function_name not in (select faw.function_name from functions_with_alive_workers as faw)
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
In local mode: always pings all enabled functions (for fast restart after code changes).
In production mode: only pings functions that have no alive workers.
Respects debounce: skips functions pinged within their heartbeat_timeout_seconds window.
Credentials: Uses Vault secrets (pgflow_service_role_key, pgflow_function_base_url) or local fallbacks.
Returns request_id from pg_net for each HTTP request made.';
-- Create "mark_worker_stopped" function
CREATE FUNCTION "pgflow"."mark_worker_stopped" ("worker_id" uuid) RETURNS void LANGUAGE sql AS $$
update pgflow.workers
  set stopped_at = clock_timestamp()
  where workers.worker_id = mark_worker_stopped.worker_id;
$$;
-- Set comment to function: "mark_worker_stopped"
COMMENT ON FUNCTION "pgflow"."mark_worker_stopped" IS 'Marks a worker as stopped for graceful shutdown. Called by workers on beforeunload.';
-- Create "setup_ensure_workers_cron" function
CREATE FUNCTION "pgflow"."setup_ensure_workers_cron" ("cron_interval" text DEFAULT '1 second') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = pgflow, cron, pg_temp AS $$
declare
  ensure_workers_job_id bigint;
  cleanup_job_id bigint;
begin
  -- Remove existing jobs if they exist (ignore errors if not found)
  begin
    perform cron.unschedule('pgflow_ensure_workers');
  exception when others then
    -- Job doesn't exist, continue
  end;

  begin
    perform cron.unschedule('pgflow_cleanup_logs');
  exception when others then
    -- Job doesn't exist, continue
  end;

  -- Schedule ensure_workers job with the specified interval
  ensure_workers_job_id := cron.schedule(
    job_name => 'pgflow_ensure_workers',
    schedule => setup_ensure_workers_cron.cron_interval,
    command => 'select pgflow.ensure_workers()'
  );

  -- Schedule cleanup job to run hourly
  cleanup_job_id := cron.schedule(
    job_name => 'pgflow_cleanup_logs',
    schedule => '0 * * * *',
    command => 'select pgflow.cleanup_ensure_workers_logs()'
  );

  return format(
    'Scheduled pgflow_ensure_workers (every %s, job_id=%s) and pgflow_cleanup_logs (hourly, job_id=%s)',
    setup_ensure_workers_cron.cron_interval,
    ensure_workers_job_id,
    cleanup_job_id
  );
end;
$$;
-- Set comment to function: "setup_ensure_workers_cron"
COMMENT ON FUNCTION "pgflow"."setup_ensure_workers_cron" IS 'Sets up cron jobs for worker management.
Schedules pgflow_ensure_workers at the specified cron_interval (default: 1 second) to keep workers running.
Schedules pgflow_cleanup_logs hourly to clean up old cron job logs.
Replaces existing jobs if they exist (idempotent).
Returns a confirmation message with job IDs.';
-- Create "track_worker_function" function
CREATE FUNCTION "pgflow"."track_worker_function" ("function_name" text) RETURNS void LANGUAGE sql AS $$
insert into pgflow.worker_functions (function_name, updated_at, last_invoked_at)
  values (track_worker_function.function_name, clock_timestamp(), clock_timestamp())
  on conflict (function_name)
  do update set
    updated_at = clock_timestamp(),
    last_invoked_at = clock_timestamp();
$$;
-- Set comment to function: "track_worker_function"
COMMENT ON FUNCTION "pgflow"."track_worker_function" IS 'Registers an edge function for monitoring. Called by workers on startup.
Sets last_invoked_at to prevent cron from pinging during startup (debounce).';
-- Drop "ensure_flow_compiled" function
DROP FUNCTION "pgflow"."ensure_flow_compiled" (text, jsonb, text);

-- Auto-install ensure_workers cron job (1 second interval)
SELECT pgflow.setup_ensure_workers_cron('1 second');
