begin;
select plan(10);
select pgflow_tests.reset_db();

-- Load the prune_old_records function
\i _shared/prune_old_records.sql.raw

-- Create a test flow with one step
-- Set max_attempts to 0 so the task fails immediately
select pgflow.create_flow('flow_that_completes', max_attempts => 0);
select pgflow.add_step('flow_that_completes', 'step');

select pgflow.create_flow('flow_that_fails', max_attempts => 0);
select pgflow.add_step('flow_that_fails', 'step');

select pgflow.create_flow('flow_that_runs', max_attempts => 0);
select pgflow.add_step('flow_that_runs', 'step');

select pgflow.create_flow('flow_that_completed_recently', max_attempts => 0);
select pgflow.add_step('flow_that_completed_recently', 'step');

select pgflow.create_flow('flow_that_failed_recently', max_attempts => 0);
select pgflow.add_step('flow_that_failed_recently', 'step');

select pgflow.create_flow('flow_that_is_still_running', max_attempts => 0);
select pgflow.add_step('flow_that_is_still_running', 'step');

-- Create a worker to test pruning
insert into pgflow.workers (worker_id, queue_name, function_name, last_heartbeat_at)
values ('11111111-1111-1111-1111-111111111111', 'old_worker', 'test_function', now() - interval '8 days'),
('22222222-1111-1111-1111-111111111111', 'recent_worker', 'test_function', now());


-- Start and complete flows
select pgflow.start_flow('flow_that_completes', '{}'::jsonb);
select pgflow_tests.poll_and_complete('flow_that_completes');
select pgflow.start_flow('flow_that_fails', '{}'::jsonb);
select pgflow_tests.poll_and_fail('flow_that_fails');

select pgflow.start_flow('flow_that_runs', '{}'::jsonb);
select pgflow_tests.poll_and_complete('flow_that_runs');

select pgflow.start_flow('flow_that_completed_recently', '{}'::jsonb);
select pgflow_tests.poll_and_complete('flow_that_completed_recently');
select pgflow.start_flow('flow_that_failed_recently', '{}'::jsonb);
select pgflow_tests.poll_and_fail('flow_that_failed_recently');

-- Start a flow that will remain "running"
select pgflow.start_flow('flow_that_is_still_running', '{}'::jsonb);

-- Verify the setup: we should have 6 runs, 6 step_states, 6 step_tasks, and 2 workers
select is(
  (select count(*) from pgflow.runs),
  6::bigint,
  'Should have 6 runs'
);

select is(
  (select count(*) from pgflow.step_states),
  6::bigint,
  'Should have 6 step_states'
);

select is(
  (select count(*) from pgflow.step_tasks),
  6::bigint,
  'Should have 6 step_tasks'
);

select is(
  (select count(*) from pgflow.workers),
  2::bigint,
  'Should have 2 workers'
);

-- PRUNE OLD RECORDS with 7-day retention - this should only prune the old worker
select pgflow.prune_old_records(7);

-- TEST: Run pruning with a 7-day retention - only old worker should be pruned
select is(
  (select count(*) from pgflow.workers),
  1::bigint,
  'Only old worker should be pruned and one worker should be left'
);

-- Set timestamps only on the worker, leaving runs, steps, and tasks as is
-- The query should only prune based on completed_at/failed_at timestamps
update pgflow.workers
set last_heartbeat_at = now() - interval '31 days';

-- Execute pruning function
select pgflow.prune_old_records(30);

-- TEST: worker record should be pruned
select is(
  (select count(*) from pgflow.workers),
  0::bigint,
  'Workers should be pruned'
);

-- In order to set fake copies of completed_at/failed_at,
-- we need to properly update timestamps based on table constraints

-- FAKE timestamps for "still running" items that are older than the cutoff
update pgflow.step_tasks
set
  queued_at = now() - interval '40 days',
  status = 'queued'
where flow_slug = 'flow_that_is_still_running';

update pgflow.step_states
set
  created_at = now() - interval '40 days',
  started_at = now() - interval '40 days',
  status = 'started'
where flow_slug = 'flow_that_is_still_running';

update pgflow.runs
set
  started_at = now() - interval '40 days',
  status = 'started'
where flow_slug = 'flow_that_is_still_running';

-- FAKE completed_at for flows that should be pruned
update pgflow.step_tasks
set
  queued_at = now() - interval '32 days',
  completed_at = now() - interval '31 days',
  status = 'completed'
where flow_slug = 'flow_that_completes';

update pgflow.step_states
set
  created_at = now() - interval '33 days',
  started_at = now() - interval '32 days',
  completed_at = now() - interval '31 days',
  status = 'completed',
  remaining_tasks = 0
where flow_slug = 'flow_that_completes';

update pgflow.runs
set
  started_at = now() - interval '33 days',
  completed_at = now() - interval '31 days',
  status = 'completed',
  remaining_steps = 0
where flow_slug = 'flow_that_completes';

-- FAKE completed_at for flows that should NOT be pruned
update pgflow.step_tasks
set
  queued_at = now() - interval '30 days',
  completed_at = now() - interval '30 days',
  status = 'completed'
where flow_slug = 'flow_that_completed_recently';

update pgflow.step_states
set
  created_at = now() - interval '31 days',
  started_at = now() - interval '30 days',
  completed_at = now() - interval '30 days',
  status = 'completed',
  remaining_tasks = 0
where flow_slug = 'flow_that_completed_recently';

update pgflow.runs
set
  started_at = now() - interval '31 days',
  completed_at = now() - interval '30 days',
  status = 'completed',
  remaining_steps = 0
where flow_slug = 'flow_that_completed_recently';

-- FAKE failed_at for flows that should be pruned
update pgflow.step_tasks
set
  queued_at = now() - interval '32 days',
  failed_at = now() - interval '31 days',
  status = 'failed',
  error_message = 'Test failure'
where flow_slug = 'flow_that_fails';

update pgflow.step_states
set
  created_at = now() - interval '33 days',
  started_at = now() - interval '32 days',
  failed_at = now() - interval '31 days',
  status = 'failed'
where flow_slug = 'flow_that_fails';

update pgflow.runs
set
  started_at = now() - interval '33 days',
  failed_at = now() - interval '31 days',
  status = 'failed'
where flow_slug = 'flow_that_fails';

-- Update timestamps for flows that have already failed but should NOT be pruned
update pgflow.step_tasks
set
  queued_at = now() - interval '30 days',
  failed_at = now() - interval '30 days'
where flow_slug = 'flow_that_failed_recently';

update pgflow.step_states
set
  created_at = now() - interval '31 days',
  started_at = now() - interval '30 days',
  failed_at = now() - interval '30 days'
where flow_slug = 'flow_that_failed_recently';

update pgflow.runs
set
  started_at = now() - interval '31 days',
  failed_at = now() - interval '30 days'
where flow_slug = 'flow_that_failed_recently';

-- Prune old records
select pgflow.prune_old_records(30);

-- TEST: verify which flows were pruned and which remain
select is(
  (select array_agg(flow_slug order by flow_slug) from pgflow.step_tasks),
  array['flow_that_completed_recently', 'flow_that_failed_recently', 'flow_that_is_still_running', 'flow_that_runs'],
  'Only tasks for completed/failed flows older than retention period should be pruned'
);

select is(
  (select array_agg(flow_slug order by flow_slug) from pgflow.step_states),
  array['flow_that_completed_recently', 'flow_that_failed_recently', 'flow_that_is_still_running', 'flow_that_runs'],
  'Only states for completed/failed flows older than retention period should be pruned'
);

select is(
  (select array_agg(flow_slug order by flow_slug) from pgflow.runs),
  array['flow_that_completed_recently', 'flow_that_failed_recently', 'flow_that_is_still_running', 'flow_that_runs'],
  'Only runs that are completed/failed and older than retention period should be pruned'
);

-- TEST: verify still-running items are not pruned even though they're older than cutoff
select is(
  (select count(*) from pgflow.runs where flow_slug = 'flow_that_is_still_running'),
  1::bigint,
  'Still-running runs should not be pruned even if older than cutoff'
);

select finish();
rollback;
