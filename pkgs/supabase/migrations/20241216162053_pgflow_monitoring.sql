create or replace function pgflow.start_monitoring()
returns void
language plpgsql
volatile
set search_path = pgflow
as $$
begin
    perform cron.schedule(
        'retry_stale_step_tasks',
        '2 seconds',
        'SELECT pgflow.retry_stale_step_tasks()'
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
