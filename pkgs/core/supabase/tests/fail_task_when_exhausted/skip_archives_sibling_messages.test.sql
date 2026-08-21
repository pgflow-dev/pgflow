-- Test: when_exhausted='skip' should archive all queued/started sibling task messages
-- Verifies that when a map step transitions to skipped, sibling messages are archived
-- Also pins the lock order: task rows are terminalized before queue rows are archived
begin;
select plan(10);
select pgflow_tests.reset_db();

-- Setup: Create flow with single root map step (max_attempts=0, when_exhausted='skip')
select pgflow.create_flow('skip_archive_test');
select pgflow.add_step(
  flow_slug => 'skip_archive_test',
  step_slug => 'map_a',
  step_type => 'map',
  max_attempts => 0,
  when_exhausted => 'skip'
);

-- Start flow with 3 array elements (creates 3 tasks)
select run_id as test_run_id from pgflow.start_flow('skip_archive_test', '[1, 2, 3]'::jsonb) \gset

-- Verify all 3 messages are in queue
select is(
  (select count(*) from pgmq.q_skip_archive_test),
  3::bigint,
  'Should have 3 messages in queue initially'
);

-- Ensure worker exists (returns worker_id uuid)
select pgflow_tests.ensure_worker('skip_archive_test') as test_worker_id \gset

-- Start task 0 and task 1 (leave task 2 queued)
-- Get message_id for task 0
select message_id as msg_0 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and task_index = 0 \gset

select pgflow.start_tasks('skip_archive_test', array[:'msg_0'::bigint], :'test_worker_id'::uuid);

-- Get message_id for task 1
select message_id as msg_1 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and task_index = 1 \gset

select pgflow.start_tasks('skip_archive_test', array[:'msg_1'::bigint], :'test_worker_id'::uuid);

-- Verify: 2 started, 1 queued
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and status = 'started'),
  2,
  'Should have 2 started tasks'
);

select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a' and status = 'queued'),
  1,
  'Should have 1 queued task'
);

-- Install a guard on the queue table: archiving (DELETE) is only allowed once the
-- owning step_tasks row left queued/started. If fail_task archives sibling messages
-- before terminalizing the sibling tasks, this trigger raises.
create or replace function pg_temp.assert_task_terminalized_before_archive()
returns trigger language plpgsql as $$
declare
  v_flow_slug text := substr(tg_table_name, 3); -- strip 'q_' prefix
  v_status text;
begin
  select st.status into v_status
  from pgflow.step_tasks st
  join pgflow.runs r on r.run_id = st.run_id
  where r.flow_slug = v_flow_slug
    and st.message_id = old.msg_id;

  if v_status in ('queued', 'started') then
    raise exception 'message % archived before its task was terminalized', old.msg_id;
  end if;

  return old;
end;
$$;

create trigger assert_terminalized_before_archive
before delete on pgmq.q_skip_archive_test
for each row execute function pg_temp.assert_task_terminalized_before_archive();

-- psql cannot interpolate :'test_run_id' inside dollar quotes, so pass it via temp table
select :'test_run_id'::uuid as run_id into temporary test_run_ids;

-- Fail task 0 (max_attempts=0 means immediate exhaustion -> step becomes skipped)
select lives_ok(
  $$
    select pgflow.fail_task(
      (select run_id from test_run_ids),
      'map_a',
      0,
      'Task 0 failed!'
    )
  $$,
  'fail_task should archive sibling messages only after terminalizing their tasks'
);

-- CRITICAL TEST: Queue should have 0 messages (all archived when step skipped)
select is(
  (select count(*) from pgmq.q_skip_archive_test),
  0::bigint,
  'Queue should be empty - sibling messages archived when step skipped'
);

-- Test: Verify messages were archived (1 from failed task, 2 from siblings)
select is(
  (select count(*) from pgmq.a_skip_archive_test),
  3::bigint,
  'All 3 messages should be in archive (failed task + 2 siblings)'
);

-- Test: Step should be skipped (not failed)
select is(
  (select status from pgflow.step_states
   where run_id = :'test_run_id'::uuid and step_slug = 'map_a'),
  'skipped',
  'Step should be skipped when when_exhausted=skip'
);

-- Test: Failed task stays failed; started and queued siblings become skipped
select results_eq(
  format($$
    select task_index, status
    from pgflow.step_tasks
    where run_id = '%s'::uuid and step_slug = 'map_a'
    order by task_index
  $$, :'test_run_id'),
  $$ values (0, 'failed'), (1, 'skipped'), (2, 'skipped') $$,
  'Task statuses should be (0, failed), (1, skipped), (2, skipped) after skip'
);

-- Test: Skipped step should have zero queued/started task rows
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_a'
     and status in ('queued', 'started')),
  0,
  'Skipped step should have zero task rows with status queued or started'
);

-- Test: Run should complete once its only step is skipped
select is(
  (select status from pgflow.runs where run_id = :'test_run_id'::uuid),
  'completed',
  'Run should be completed after its only step was skipped'
);

select * from finish();
rollback;
