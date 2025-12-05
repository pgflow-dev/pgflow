-- Create "mark_worker_stopped" function
CREATE FUNCTION "pgflow"."mark_worker_stopped" ("worker_id" uuid) RETURNS void LANGUAGE sql AS $$
update pgflow.workers
  set stopped_at = clock_timestamp()
  where workers.worker_id = mark_worker_stopped.worker_id;
$$;
-- Set comment to function: "mark_worker_stopped"
COMMENT ON FUNCTION "pgflow"."mark_worker_stopped" IS 'Marks a worker as stopped for graceful shutdown. Called by workers on beforeunload.';
