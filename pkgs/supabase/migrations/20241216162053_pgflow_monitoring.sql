create or replace function pgflow.start_monitoring()
returns void
language plpgsql
volatile
set search_path = pgflow
as $$
begin
    perform cron.schedule(
        'pgflow/retry_stale_step_tasks',
        '2 seconds',
        'SELECT pgflow.retry_stale_step_tasks()'
    );

    -- Delete old cron.job_run_details records of the current user every day at noon
    perform cron.schedule(
        'cron/prune_job_run_details',
        '0 12 * * *',
        $cron_job$
            DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'
        $cron_job$
    );
end;
$$;

create or replace function pgflow.stop_monitoring()
returns void
language plpgsql
volatile
set search_path = pgflow
as $$
begin
    perform cron.unschedule('retry_stale_step_tasks');
end;
$$;
