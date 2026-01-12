-- Cron setup function for automatic requeue monitoring
create or replace function pgflow.setup_requeue_stalled_tasks_cron(
  cron_interval text default '15 seconds'
)
returns text
language plpgsql
security definer
set search_path = pgflow, cron, pg_temp
as $$
declare
  job_id bigint;
begin
  -- Remove existing job if any
  begin
    perform cron.unschedule('pgflow_requeue_stalled_tasks');
  exception
    when others then null;
  end;

  -- Schedule the new job
  job_id := cron.schedule(
    job_name => 'pgflow_requeue_stalled_tasks',
    schedule => setup_requeue_stalled_tasks_cron.cron_interval,
    command => 'select pgflow.requeue_stalled_tasks()'
  );

  return format('Scheduled pgflow_requeue_stalled_tasks (every %s, job_id=%s)', 
    setup_requeue_stalled_tasks_cron.cron_interval, job_id);
end;
$$;

comment on function pgflow.setup_requeue_stalled_tasks_cron(text) is
'Sets up cron job to automatically requeue stalled tasks.
Schedules pgflow_requeue_stalled_tasks at the specified cron_interval (default: 15 seconds).
Replaces existing job if it exists (idempotent).
Returns a confirmation message with job ID.';

-- Automatically set up the cron job when migration runs
select pgflow.setup_requeue_stalled_tasks_cron();
