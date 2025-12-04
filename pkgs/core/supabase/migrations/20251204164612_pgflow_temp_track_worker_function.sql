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
