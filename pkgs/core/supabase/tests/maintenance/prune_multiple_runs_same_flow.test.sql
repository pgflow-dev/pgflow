begin;
select plan(8);
select pgflow_tests.reset_db();

-- Load the prune_data_older_than function
\i _shared/prune_data_older_than.sql.raw

-- Create a single flow that will have multiple runs
select pgflow.create_flow('multi_run_flow', max_attempts => 0);
select pgflow.add_step('multi_run_flow', 'step1');

-- Start 5 runs of the same flow with different outcomes
-- Run 1: Will complete and be aged to 31 days (should be pruned)
select pgflow.start_flow('multi_run_flow', '{"run": 1}'::jsonb);
select pgflow_tests.poll_and_complete('multi_run_flow');

-- Run 2: Will fail and be aged to 31 days (should be pruned)
select pgflow.start_flow('multi_run_flow', '{"run": 2}'::jsonb);
select pgflow_tests.poll_and_fail('multi_run_flow');

-- Run 3: Will complete and be aged to 29 days (should NOT be pruned)
select pgflow.start_flow('multi_run_flow', '{"run": 3}'::jsonb);
select pgflow_tests.poll_and_complete('multi_run_flow');

-- Run 4: Will fail and be aged to 29 days (should NOT be pruned)
select pgflow.start_flow('multi_run_flow', '{"run": 4}'::jsonb);
select pgflow_tests.poll_and_fail('multi_run_flow');

-- Run 5: Will remain running (should NOT be pruned regardless of age)
select pgflow.start_flow('multi_run_flow', '{"run": 5}'::jsonb);

-- Verify setup: should have 5 runs
select is(
  (select count(*) from pgflow.runs where flow_slug = 'multi_run_flow'),
  5::bigint,
  'Should have 5 runs before pruning'
);

-- Store run_ids for verification
create temp table run_ids as
select
  run_id,
  input->>'run' as run_number,
  status
from pgflow.runs
where flow_slug = 'multi_run_flow'
order by (input->>'run')::int;

-- Age run 1 (completed, 31 days old - should be pruned)
update pgflow.runs
set
  started_at = now() - interval '32 days',
  completed_at = now() - interval '31 days'
where run_id = (select run_id from run_ids where run_number = '1');

update pgflow.step_states
set
  created_at = now() - interval '32 days',
  started_at = now() - interval '31 days' - interval '1 minute',
  completed_at = now() - interval '31 days'
where run_id = (select run_id from run_ids where run_number = '1');

update pgflow.step_tasks
set
  queued_at = now() - interval '32 days',
  started_at = now() - interval '31 days' - interval '1 minute',
  completed_at = now() - interval '31 days'
where run_id = (select run_id from run_ids where run_number = '1');

-- Age run 2 (failed, 31 days old - should be pruned)
update pgflow.runs
set
  started_at = now() - interval '32 days',
  failed_at = now() - interval '31 days'
where run_id = (select run_id from run_ids where run_number = '2');

update pgflow.step_states
set
  created_at = now() - interval '32 days',
  started_at = now() - interval '31 days' - interval '1 minute',
  failed_at = now() - interval '31 days'
where run_id = (select run_id from run_ids where run_number = '2');

update pgflow.step_tasks
set
  queued_at = now() - interval '32 days',
  started_at = now() - interval '31 days' - interval '1 minute',
  failed_at = now() - interval '31 days'
where run_id = (select run_id from run_ids where run_number = '2');

-- Age run 3 (completed, 29 days old - should NOT be pruned)
update pgflow.runs
set
  started_at = now() - interval '30 days',
  completed_at = now() - interval '29 days'
where run_id = (select run_id from run_ids where run_number = '3');

update pgflow.step_states
set
  created_at = now() - interval '30 days',
  started_at = now() - interval '29 days' - interval '1 minute',
  completed_at = now() - interval '29 days'
where run_id = (select run_id from run_ids where run_number = '3');

update pgflow.step_tasks
set
  queued_at = now() - interval '30 days',
  started_at = now() - interval '29 days' - interval '1 minute',
  completed_at = now() - interval '29 days'
where run_id = (select run_id from run_ids where run_number = '3');

-- Age run 4 (failed, 29 days old - should NOT be pruned)
update pgflow.runs
set
  started_at = now() - interval '30 days',
  failed_at = now() - interval '29 days'
where run_id = (select run_id from run_ids where run_number = '4');

update pgflow.step_states
set
  created_at = now() - interval '30 days',
  started_at = now() - interval '29 days' - interval '1 minute',
  failed_at = now() - interval '29 days'
where run_id = (select run_id from run_ids where run_number = '4');

update pgflow.step_tasks
set
  queued_at = now() - interval '30 days',
  started_at = now() - interval '29 days' - interval '1 minute',
  failed_at = now() - interval '29 days'
where run_id = (select run_id from run_ids where run_number = '4');

-- Age run 5 (still running, 40 days old - should NOT be pruned despite age)
update pgflow.runs
set started_at = now() - interval '40 days'
where run_id = (select run_id from run_ids where run_number = '5');

update pgflow.step_states
set created_at = now() - interval '40 days'
where run_id = (select run_id from run_ids where run_number = '5');

update pgflow.step_tasks
set queued_at = now() - interval '40 days'
where run_id = (select run_id from run_ids where run_number = '5');

-- Prune with 30-day retention
select pgflow.prune_data_older_than(make_interval(days => 30));

-- TEST: Should have 3 runs left (runs 3, 4, 5)
select is(
  (select count(*) from pgflow.runs where flow_slug = 'multi_run_flow'),
  3::bigint,
  'Should have 3 runs after pruning (kept runs 3, 4, 5)'
);

-- TEST: Verify specific runs are deleted
select is(
  (select count(*) from pgflow.runs
   where run_id in (
     select run_id from run_ids where run_number in ('1', '2')
   )),
  0::bigint,
  'Runs 1 and 2 should be deleted (old completed/failed)'
);

-- TEST: Verify specific runs are kept
select is(
  (select count(*) from pgflow.runs
   where run_id in (
     select run_id from run_ids where run_number in ('3', '4', '5')
   )),
  3::bigint,
  'Runs 3, 4, and 5 should be kept (recent or still running)'
);

-- TEST: Verify step_states count matches
select is(
  (select count(*) from pgflow.step_states where flow_slug = 'multi_run_flow'),
  3::bigint,
  'Should have 3 step_states after pruning'
);

-- TEST: Verify step_tasks count matches
select is(
  (select count(*) from pgflow.step_tasks where flow_slug = 'multi_run_flow'),
  3::bigint,
  'Should have 3 step_tasks after pruning'
);

-- TEST: Verify still-running run is kept despite being very old
select is(
  (select count(*) from pgflow.runs
   where run_id = (select run_id from run_ids where run_number = '5')
   and status = 'started'),
  1::bigint,
  'Still-running run should be kept even though it is 40 days old'
);

-- TEST: Verify run data integrity - run 3 should have correct input
select is(
  (select input->>'run' from pgflow.runs
   where run_id = (select run_id from run_ids where run_number = '3')),
  '3',
  'Kept run should maintain correct data (run 3 input preserved)'
);

select finish();
rollback;
