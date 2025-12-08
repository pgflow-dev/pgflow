-- Worker Functions Table
-- Tracks which edge functions should be pinged by ensure_workers() cron

create table if not exists pgflow.worker_functions (
  function_name text not null primary key,
  enabled boolean not null default true,
  heartbeat_timeout_seconds integer not null default 6,
  last_invoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table pgflow.worker_functions is
'Registry of edge functions that run pgflow workers, used by ensure_workers() cron';

comment on column pgflow.worker_functions.function_name is
'Name of the Supabase Edge Function';

comment on column pgflow.worker_functions.enabled is
'Whether ensure_workers() should ping this function';

comment on column pgflow.worker_functions.heartbeat_timeout_seconds is
'How long before considering a worker dead (no heartbeat)';

comment on column pgflow.worker_functions.last_invoked_at is
'When ensure_workers() last pinged this function (used for debouncing)';
