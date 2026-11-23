-- Worker Functions Table
-- Tracks which edge functions should be pinged by ensure_workers() cron

create table if not exists pgflow.worker_functions (
  function_name text not null primary key,
  start_mode text not null default 'http',
  constraint worker_functions_start_mode_check check (start_mode in ('http', 'process')),
  enabled boolean not null default true,
  debounce interval not null default '6 seconds'
  check (debounce >= '1 second'),
  last_invoked_at timestamptz,
  invocation_id uuid,
  invocation_expires_at timestamptz,
  invocation_status text check (invocation_status in ('pending', 'ready', 'failed')),
  invocation_worker_id uuid,
  invocation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table pgflow.worker_functions is
'Registry of edge functions that run pgflow workers, used by ensure_workers() cron';

comment on column pgflow.worker_functions.function_name is
'Name of the Supabase Edge Function';

comment on column pgflow.worker_functions.start_mode is
'How this worker function is started: http workers are pinged by ensure_workers(), process workers self-start';

comment on column pgflow.worker_functions.enabled is
'Whether ensure_workers() should ping this function';

comment on column pgflow.worker_functions.debounce is
'Minimum interval between invocation attempts for this function';

comment on column pgflow.worker_functions.last_invoked_at is
'When startup was last reserved (retry throttle, not a readiness signal)';

comment on column pgflow.worker_functions.invocation_id is
'Current startup handshake ID; retained after readiness or failure for idempotent reconciliation';

comment on column pgflow.worker_functions.invocation_expires_at is
'Database-clock deadline for pending startup. An expired pending invocation is retryable';

comment on column pgflow.worker_functions.invocation_status is
'pending: awaiting readiness; ready: handshake completed, not worker lifetime; failed: retryable after debounce';

comment on column pgflow.worker_functions.invocation_worker_id is
'Worker that completed the current startup handshake';

comment on column pgflow.worker_functions.invocation_error is
'Reason the current startup handshake failed, if explicitly dismissed';
