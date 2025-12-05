-- Test: cleanup_ensure_workers_logs() deletes old entries and returns correct count
begin;
select plan(3);
select pgflow_tests.reset_db();

-- Clear existing cron job run details
delete from cron.job_run_details;

-- Setup: Create job run details at different ages (testing 4h custom retention)
insert into cron.job_run_details (runid, jobid, command, status, end_time)
values
  (1, 1, 'select some_function()', 'succeeded', now() - interval '5 hours'),  -- Should be deleted
  (2, 1, 'select some_function()', 'succeeded', now() - interval '6 hours'),  -- Should be deleted
  (3, 1, 'select some_function()', 'succeeded', now() - interval '3 hours'),  -- Should be kept
  (4, 1, 'select some_function()', 'succeeded', now() - interval '1 hour');   -- Should be kept

-- Execute cleanup with 4 hour retention
with result as (
  select * from pgflow.cleanup_ensure_workers_logs(retention_hours => 4)
)
select is(
  (select cron_deleted from result),
  2::bigint,
  'Should return count of 2 deleted entries'
);

-- Test: Old entries were deleted
select is(
  (select count(*) from cron.job_run_details where runid in (1, 2)),
  0::bigint,
  'Entries older than retention should be deleted'
);

-- Test: Recent entries were kept
select is(
  (select count(*) from cron.job_run_details where runid in (3, 4)),
  2::bigint,
  'Entries newer than retention should be kept'
);

select finish();
rollback;
