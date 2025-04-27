-- Inactive workers are workers that have not sent
-- a heartbeat in the last 6 seconds
create or replace view pgflow.inactive_workers as
select
  worker_id,
  queue_name,
  function_name,
  started_at,
  stopped_at,
  last_heartbeat_at
from pgflow.workers
where last_heartbeat_at < now() - make_interval(secs => 6);
