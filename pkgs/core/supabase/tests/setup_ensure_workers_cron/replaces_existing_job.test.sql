-- Test: setup_ensure_workers_cron() replaces existing job when called twice
begin;
select plan(3);

-- Setup first job with 1 second interval
select pgflow.setup_ensure_workers_cron(cron_interval => '1 second');

-- Get job count after first call
select is(
  (select count(*)::int from cron.job where jobname = 'pgflow_ensure_workers'),
  1,
  'Should have exactly one ensure_workers job after first call'
);

-- Call again with different interval (should replace, not duplicate)
select pgflow.setup_ensure_workers_cron(cron_interval => '2 seconds');

-- Test: Still only one job (no duplicates)
select is(
  (select count(*)::int from cron.job where jobname = 'pgflow_ensure_workers'),
  1,
  'Should still have exactly one ensure_workers job after second call'
);

-- Test: Job has updated schedule
select is(
  (select schedule from cron.job where jobname = 'pgflow_ensure_workers'),
  '2 seconds',
  'Job should have updated schedule after second call'
);

select finish();
rollback;
