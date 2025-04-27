-- Edge Worker Tables

create table if not exists pgflow.workers (
  worker_id uuid not null primary key,
  queue_name text not null,
  function_name text not null,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  last_heartbeat_at timestamptz not null default now()
);

create index if not exists idx_workers_queue_name on pgflow.workers (queue_name);
