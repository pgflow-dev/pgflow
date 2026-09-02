-- Test: late complete_task() and fail_task() callbacks after cancellation are idempotent
-- Cancellation wins: repeated late callbacks must not revive cancelled rows, rewrite
-- history, change parent state or counters, or duplicate events.
begin;
select plan(10);
select pgflow_tests.reset_db();

-- Map step with one allowed attempt: exhausting task 0 fails the run
select pgflow.create_flow('late_callback_test', max_attempts => 1);
select pgflow.add_step(
  flow_slug => 'late_callback_test',
  step_slug => 'map_step',
  step_type => 'map'
);

select run_id as test_run_id from pgflow.start_flow('late_callback_test', '["a", "b"]'::jsonb) \gset

-- Start both tasks
select pgflow_tests.ensure_worker('late_callback_test') as test_worker_id \gset

select message_id as msg_0 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 0 \gset
select pgflow.start_tasks('late_callback_test', array[:'msg_0'::bigint], :'test_worker_id'::uuid);

select message_id as msg_1 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1 \gset
select pgflow.start_tasks('late_callback_test', array[:'msg_1'::bigint], :'test_worker_id'::uuid);

-- Fail task 0: run fails, task 1 becomes cancelled
select pgflow.fail_task(:'test_run_id'::uuid, 'map_step', 0, 'Task 0 failed');

select is(
  (select status from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1),
  'cancelled',
  'Sibling task should be cancelled when the run fails'
);

-- Snapshot state before the late callbacks
create temporary table task_before as
select status, attempts_count, error_message, output, started_at, completed_at,
       failed_at, last_worker_id
from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1;

create temporary table run_before as
select run_id, status, failed_at, remaining_steps from pgflow.runs
where run_id = :'test_run_id'::uuid;

-- Late callbacks, each repeated
select pgflow.complete_task(:'test_run_id'::uuid, 'map_step', 1, '{"late": true}'::jsonb);
select pgflow.complete_task(:'test_run_id'::uuid, 'map_step', 1, '{"late": true}'::jsonb);
select pgflow.fail_task(:'test_run_id'::uuid, 'map_step', 1, 'Late failure');
select pgflow.fail_task(:'test_run_id'::uuid, 'map_step', 1, 'Late failure');

-- Cancelled row is unchanged
select results_eq(
  $$
    select status, attempts_count, error_message, output, started_at,
           completed_at, failed_at, last_worker_id
    from pgflow.step_tasks
    where run_id = (select run_id from run_before limit 1)
      and step_slug = 'map_step' and task_index = 1
  $$,
  $$ select status, attempts_count, error_message, output, started_at,
            completed_at, failed_at, last_worker_id from task_before $$,
  'Repeated late callbacks should leave the cancelled row and its history unchanged'
);

-- Late complete_task must not write an output
select is(
  (select output from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1),
  null,
  'Late complete_task should not store output on cancelled task'
);

-- Late fail_task must not write an error
select is(
  (select error_message from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1),
  null,
  'Late fail_task should not write error_message on cancelled task'
);

-- Parent state unchanged
select results_eq(
  $$ select status, failed_at, remaining_steps from pgflow.runs
     where run_id = (select run_id from run_before limit 1) $$,
  $$ select status, failed_at, remaining_steps from run_before $$,
  'Late callbacks should not change run status, failed_at, or counters'
);

select is(
  (select status from pgflow.step_states
   where run_id = :'test_run_id'::uuid and step_slug = 'map_step'),
  'failed',
  'Step state should stay failed after late callbacks'
);

-- Culprit task stays failed
select is(
  (select status from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 0),
  'failed',
  'Genuinely failed culprit task should stay failed'
);

-- Events are not duplicated
select is(
  pgflow_tests.count_realtime_events('run:failed', :'test_run_id'::uuid),
  1::int,
  'Late callbacks should not duplicate run:failed events'
);

select is(
  pgflow_tests.count_realtime_events('step:failed', :'test_run_id'::uuid, 'map_step'),
  1::int,
  'Late callbacks should not duplicate step:failed events'
);

-- No active queue rows reappear
select is(
  (select count(*) from pgmq.q_late_callback_test),
  0::bigint,
  'Late callbacks should leave the queue empty'
);

select * from finish();
rollback;
