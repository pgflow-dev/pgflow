-- Test: setup_ensure_workers_cron() schedules the ensure_workers job
begin;
select plan(3);

-- Execute function (should be idempotent - handles existing jobs internally)
select pgflow.setup_ensure_workers_cron();

-- Test: Job is created
select ok(
  exists(select 1 from cron.job where jobname = 'pgflow_ensure_workers'),
  'Should create pgflow_ensure_workers job'
);

-- Test: Job has correct schedule (1 second default)
select is(
  (select schedule from cron.job where jobname = 'pgflow_ensure_workers'),
  '1 second',
  'Job should have 1 second schedule by default'
);

-- Test: Job runs the correct command
select ok(
  (select command from cron.job where jobname = 'pgflow_ensure_workers') like '%pgflow.ensure_workers()%',
  'Job should call pgflow.ensure_workers()'
);

select finish();
rollback;
