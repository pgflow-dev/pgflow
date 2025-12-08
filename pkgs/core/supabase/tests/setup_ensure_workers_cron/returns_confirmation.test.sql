-- Test: setup_ensure_workers_cron() returns confirmation message
begin;
select plan(2);

-- Execute function and capture result (handles existing jobs internally)
select pgflow.setup_ensure_workers_cron() as message into temporary result;

-- Test: Returns a non-null message
select ok(
  (select message from result) is not null,
  'Should return a confirmation message'
);

-- Test: Message mentions the scheduled jobs
select ok(
  (select message from result) like '%pgflow_ensure_workers%',
  'Confirmation message should mention the scheduled job'
);

drop table result;
select finish();
rollback;
