-- Edge Worker Tables

create table if not exists pgflow.workers (
  worker_id uuid not null primary key,
  queue_name text not null,
  function_name text not null,
  started_at timestamptz not null default now(),
  deprecated_at timestamptz,
  stopped_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  -- Version of the pgflow package the worker was built from, stamped once at
  -- registration. Nullable: rows written before telemetry exist. Telemetry
  -- reads a per-day distribution; MAX() is the newest version ever run.
  pgflow_version text
);

create index if not exists idx_workers_queue_name on pgflow.workers (queue_name);
create index if not exists idx_workers_heartbeat on pgflow.workers (last_heartbeat_at);
create index if not exists idx_workers_started_at on pgflow.workers (started_at);
create index if not exists idx_workers_stopped_at on pgflow.workers (stopped_at);
