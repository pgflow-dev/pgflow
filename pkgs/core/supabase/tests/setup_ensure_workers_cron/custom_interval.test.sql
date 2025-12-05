-- Test: setup_ensure_workers_cron() accepts custom interval
begin;
select plan(2);

-- Execute function with custom interval (handles existing jobs internally)
select pgflow.setup_ensure_workers_cron(cron_interval => '5 seconds');

-- Test: Job is created with custom interval
select ok(
  exists(select 1 from cron.job where jobname = 'pgflow_ensure_workers'),
  'Should create pgflow_ensure_workers job'
);

-- Test: Job has the custom schedule
select is(
  (select schedule from cron.job where jobname = 'pgflow_ensure_workers'),
  '5 seconds',
  'Job should have 5 seconds schedule as specified'
);

select finish();
rollback;
