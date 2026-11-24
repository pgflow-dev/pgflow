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
  escalate_job_id bigint;
begin
  -- Remove existing jobs if any
  begin
    perform cron.unschedule('pgflow_requeue_stalled_tasks');
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('pgflow_escalate_permanently_stalled');
  exception
    when others then null;
  end;

  -- Schedule the recovery job
  job_id := cron.schedule(
    job_name => 'pgflow_requeue_stalled_tasks',
    schedule => setup_requeue_stalled_tasks_cron.cron_interval,
    command => 'select pgflow.requeue_stalled_tasks()'
  );

  -- Schedule escalation as its own job and transaction. The jobs may overlap;
  -- recovery locks step_tasks first, while fail_task() locks the run and step
  -- first (#689). Separate transactions release recovery locks before the next
  -- escalation sweep, whose candidate rows are rechecked under lock.
  escalate_job_id := cron.schedule(
    job_name => 'pgflow_escalate_permanently_stalled',
    schedule => setup_requeue_stalled_tasks_cron.cron_interval,
    command => 'select pgflow.escalate_permanently_stalled()'
  );

  return format(
    'Scheduled pgflow_requeue_stalled_tasks (every %s, job_id=%s) and pgflow_escalate_permanently_stalled (job_id=%s)',
    setup_requeue_stalled_tasks_cron.cron_interval,
    job_id,
    escalate_job_id
  );
end;
$$;

comment on function pgflow.setup_requeue_stalled_tasks_cron(text) is
'Sets up cron jobs to automatically recover and terminalize stalled tasks.
Schedules pgflow_requeue_stalled_tasks and pgflow_escalate_permanently_stalled
at the specified cron_interval (default: 15 seconds).
Escalation runs as a separate job so recovery commits before fail_task()
locks are taken (#689).
Replaces existing jobs if they exist (idempotent).
Returns a confirmation message with job IDs.';

-- Automatically set up the cron job when migration runs
select pgflow.setup_requeue_stalled_tasks_cron();
