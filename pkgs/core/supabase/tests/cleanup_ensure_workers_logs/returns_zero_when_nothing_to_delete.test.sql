-- Test: cleanup_ensure_workers_logs() returns 0 when no old entries exist
begin;
select plan(1);
select pgflow_tests.reset_db();

-- Clear existing cron job run details
delete from cron.job_run_details;

-- Setup: Only recent entries exist
insert into cron.job_run_details (runid, jobid, command, status, end_time)
values
  (1, 1, 'select some_function()', 'succeeded', now() - interval '1 hour'),
  (2, 1, 'select some_function()', 'succeeded', now() - interval '2 hours');

-- Execute cleanup - nothing should be deleted
with result as (
  select * from pgflow.cleanup_ensure_workers_logs()
)
select is(
  (select cron_deleted from result),
  0::bigint,
  'Should return 0 when no entries exceed retention period'
);

select finish();
rollback;
