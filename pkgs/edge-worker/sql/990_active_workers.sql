-- Active workers are workers that have sent a heartbeat in the last 6 seconds
create or replace view edge_worker.active_workers as
select
    worker_id,
    queue_name,
    function_name,
    started_at,
    stopped_at,
    last_heartbeat_at
from edge_worker.workers
where last_heartbeat_at > now() - make_interval(secs => 6);
