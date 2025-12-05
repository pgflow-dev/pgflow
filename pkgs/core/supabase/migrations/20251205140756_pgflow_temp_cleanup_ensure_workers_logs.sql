-- Create "cleanup_ensure_workers_logs" function
CREATE FUNCTION "pgflow"."cleanup_ensure_workers_logs" ("retention_hours" integer DEFAULT 24) RETURNS TABLE ("cron_deleted" bigint) LANGUAGE sql SECURITY DEFINER SET "search_path" = pgflow, cron, pg_temp AS $$
with deleted as (
    delete from cron.job_run_details
    where job_run_details.end_time < now() - (cleanup_ensure_workers_logs.retention_hours || ' hours')::interval
    returning 1
  )
  select count(*)::bigint as cron_deleted from deleted
$$;
-- Set comment to function: "cleanup_ensure_workers_logs"
COMMENT ON FUNCTION "pgflow"."cleanup_ensure_workers_logs" IS 'Cleans up old cron job run details to prevent table growth.
Default retention is 24 hours. HTTP response logs (net._http_response) are
automatically cleaned by pg_net with a 6-hour TTL, so they are not cleaned here.
This function follows the standard pg_cron maintenance pattern recommended by
AWS RDS, Neon, and Supabase documentation.';
