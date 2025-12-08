-- Setup Ensure Workers Cron
-- Sets up cron jobs for worker management: ensure_workers (configurable interval) and cleanup_logs (hourly)

create or replace function pgflow.setup_ensure_workers_cron(
  cron_interval text default '1 second'
)
returns text
language plpgsql
security definer
set search_path = pgflow, cron, pg_temp
as $$
declare
  ensure_workers_job_id bigint;
  cleanup_job_id bigint;
begin
  -- Remove existing jobs if they exist (ignore errors if not found)
  begin
    perform cron.unschedule('pgflow_ensure_workers');
  exception when others then
    -- Job doesn't exist, continue
  end;

  begin
    perform cron.unschedule('pgflow_cleanup_logs');
  exception when others then
    -- Job doesn't exist, continue
  end;

  -- Schedule ensure_workers job with the specified interval
  ensure_workers_job_id := cron.schedule(
    job_name => 'pgflow_ensure_workers',
    schedule => setup_ensure_workers_cron.cron_interval,
    command => 'select pgflow.ensure_workers()'
  );

  -- Schedule cleanup job to run hourly
  cleanup_job_id := cron.schedule(
    job_name => 'pgflow_cleanup_logs',
    schedule => '0 * * * *',
    command => 'select pgflow.cleanup_ensure_workers_logs()'
  );

  return format(
    'Scheduled pgflow_ensure_workers (every %s, job_id=%s) and pgflow_cleanup_logs (hourly, job_id=%s)',
    setup_ensure_workers_cron.cron_interval,
    ensure_workers_job_id,
    cleanup_job_id
  );
end;
$$;

comment on function pgflow.setup_ensure_workers_cron(text) is
'Sets up cron jobs for worker management.
Schedules pgflow_ensure_workers at the specified cron_interval (default: 1 second) to keep workers running.
Schedules pgflow_cleanup_logs hourly to clean up old cron job logs.
Replaces existing jobs if they exist (idempotent).
Returns a confirmation message with job IDs.';
