-- Edge Worker Tables

create table if not exists edge_worker.workers (
  worker_id uuid not null primary key,
  queue_name text not null,
  function_name text not null,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  last_heartbeat_at timestamptz not null default now()
);
