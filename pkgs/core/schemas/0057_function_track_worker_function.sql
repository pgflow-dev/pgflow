-- Track Worker Function
-- Registers an edge function for monitoring by ensure_workers() cron

create or replace function pgflow.track_worker_function(
  function_name text
) returns void
language sql
as $$
  insert into pgflow.worker_functions (function_name, updated_at, last_invoked_at)
  values (track_worker_function.function_name, clock_timestamp(), clock_timestamp())
  on conflict (function_name)
  do update set
    updated_at = clock_timestamp(),
    last_invoked_at = clock_timestamp();
$$;

comment on function pgflow.track_worker_function(text) is
'Registers an edge function for monitoring. Called by workers on startup.
Sets last_invoked_at to prevent cron from pinging during startup (debounce).';
