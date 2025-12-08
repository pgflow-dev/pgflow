-- Mark Worker Stopped
-- Sets stopped_at timestamp on a worker row for graceful shutdown signaling

drop function if exists pgflow.mark_worker_stopped(uuid);

create or replace function pgflow.mark_worker_stopped(
  worker_id uuid
) returns void
language sql
as $$
  update pgflow.workers
  set stopped_at = clock_timestamp()
  where workers.worker_id = mark_worker_stopped.worker_id;
$$;

comment on function pgflow.mark_worker_stopped(uuid) is
'Marks a worker as stopped for graceful shutdown. Called by workers on beforeunload.';
