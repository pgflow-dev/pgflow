-- Cleanup Ensure Workers Logs
-- Cleans up old cron job run details to prevent the table from growing indefinitely.
-- Note: net._http_response is automatically cleaned by pg_net (6 hour TTL), so we only clean cron logs.

create or replace function pgflow.cleanup_ensure_workers_logs(
  retention_hours integer default 24
)
returns table (cron_deleted bigint)
language sql
security definer
set search_path = pgflow, cron, pg_temp
as $$
  with deleted as (
    delete from cron.job_run_details
    where job_run_details.end_time < now() - (cleanup_ensure_workers_logs.retention_hours || ' hours')::interval
    returning 1
  )
  select count(*)::bigint as cron_deleted from deleted
$$;

comment on function pgflow.cleanup_ensure_workers_logs(integer) is
'Cleans up old cron job run details to prevent table growth.
Default retention is 24 hours. HTTP response logs (net._http_response) are
automatically cleaned by pg_net with a 6-hour TTL, so they are not cleaned here.
This function follows the standard pg_cron maintenance pattern recommended by
AWS RDS, Neon, and Supabase documentation.';
