-- Test: setup_ensure_workers_cron() schedules the cleanup job
begin;
select plan(3);

-- Execute function (should be idempotent - handles existing jobs internally)
select pgflow.setup_ensure_workers_cron();

-- Test: Cleanup job is created
select ok(
  exists(select 1 from cron.job where jobname = 'pgflow_cleanup_logs'),
  'Should create pgflow_cleanup_logs job'
);

-- Test: Cleanup job runs hourly
select is(
  (select schedule from cron.job where jobname = 'pgflow_cleanup_logs'),
  '0 * * * *',
  'Cleanup job should run hourly (every hour at minute 0)'
);

-- Test: Cleanup job runs the correct command
select ok(
  (select command from cron.job where jobname = 'pgflow_cleanup_logs') like '%pgflow.cleanup_ensure_workers_logs()%',
  'Cleanup job should call pgflow.cleanup_ensure_workers_logs()'
);

select finish();
rollback;
