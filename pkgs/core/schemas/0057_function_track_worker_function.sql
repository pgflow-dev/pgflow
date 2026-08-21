-- Track Worker Function
-- Registers an edge function for monitoring by ensure_workers() cron

create or replace function pgflow.track_worker_function(
  function_name text,
  start_mode text default 'http'
) returns void
language sql
as $$
  insert into pgflow.worker_functions (function_name, start_mode, updated_at)
  values (track_worker_function.function_name, track_worker_function.start_mode, clock_timestamp())
  on conflict (function_name)
  do update set
    start_mode = excluded.start_mode,
    updated_at = clock_timestamp();
$$;

comment on function pgflow.track_worker_function(text, text) is
'Registers an edge function for monitoring. Called by workers on startup.';
