-- Test: setup_requeue_stalled_tasks_cron() function
begin;
select plan(6);

select pgflow_tests.reset_db();

-- Test 1: Function exists
select has_function(
  'pgflow',
  'setup_requeue_stalled_tasks_cron',
  array['text'],
  'setup_requeue_stalled_tasks_cron(text) should exist'
);

-- Test 2: Default call with no arguments creates cron job
select ok(
  pgflow.setup_requeue_stalled_tasks_cron() is not null,
  'setup_requeue_stalled_tasks_cron() should return confirmation message'
);

-- Test 3: Cron job is created with correct name
select ok(
  exists(
    select 1 from cron.job
    where jobname = 'pgflow_requeue_stalled_tasks'
  ),
  'Cron job pgflow_requeue_stalled_tasks should be created'
);

-- Test 4: Default schedule is every 15 seconds
select is(
  (select schedule from cron.job where jobname = 'pgflow_requeue_stalled_tasks'),
  '15 seconds',
  'Default schedule should be 15 seconds'
);

-- Test 5: Calling with custom interval updates the schedule
select pgflow.setup_requeue_stalled_tasks_cron('30 seconds');

select is(
  (select schedule from cron.job where jobname = 'pgflow_requeue_stalled_tasks'),
  '30 seconds',
  'Schedule should be updated to 30 seconds'
);

-- Test 6: Job command calls requeue_stalled_tasks
select ok(
  (select command from cron.job where jobname = 'pgflow_requeue_stalled_tasks') 
    like '%requeue_stalled_tasks%',
  'Cron job should call requeue_stalled_tasks'
);

select finish();
rollback;
