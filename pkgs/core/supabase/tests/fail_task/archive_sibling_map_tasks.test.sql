begin;
select plan(10);
select pgflow_tests.reset_db();

-- Test: fail_task should cancel unfinished sibling tasks and archive their messages
-- Reproduction of #645: task 0 fails, task 1 started -> cancelled, task 2 queued -> cancelled

-- Create flow with a map step that fails the run on exhaustion
select pgflow.create_flow('test_map_fail');
select pgflow.add_step(
  flow_slug => 'test_map_fail',
  step_slug => 'map_step',
  step_type => 'map',
  max_attempts => 1
);

-- Start flow with 3 array elements
select run_id as test_run_id from pgflow.start_flow('test_map_fail', '["a", "b", "c"]'::jsonb) \gset

-- Verify all 3 messages are in queue
select is(
  (select count(*) from pgmq.q_test_map_fail),
  3::bigint,
  'Should have 3 messages in queue for 3 map tasks'
);

-- Ensure worker exists for polling
select pgflow_tests.ensure_worker('test_map_fail') as test_worker_id \gset

-- Start task 0 (will be the failing task)
select message_id as msg_0 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 0 \gset
select pgflow.start_tasks('test_map_fail', array[:'msg_0'::bigint], :'test_worker_id'::uuid);

-- Start task 1 (unfinished started sibling)
select message_id as msg_1 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1 \gset
select pgflow.start_tasks('test_map_fail', array[:'msg_1'::bigint], :'test_worker_id'::uuid);

-- Task 2 stays queued

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
before delete on pgmq.q_test_map_fail
for each row execute function pg_temp.assert_task_terminalized_before_archive();

-- psql cannot interpolate :'test_run_id' inside dollar quotes, so pass it via temp table
select :'test_run_id'::uuid as run_id into temporary test_run_ids;

-- Fail task 0 (max_attempts=1 -> immediate exhaustion -> run fails)
select lives_ok(
  $$
    select pgflow.fail_task(
      (select run_id from test_run_ids),
      'map_step',
      0,
      'Task failed!'
    )
  $$,
  'fail_task should archive sibling messages only after terminalizing their tasks'
);

-- Test: Run should be marked as failed
select is(
  (select status from pgflow.runs where run_id = :'test_run_id'::uuid),
  'failed',
  'Run should be marked as failed after task failure'
);

-- Test: task 0 failed, task 1 (started) cancelled, task 2 (queued) cancelled
select results_eq(
  format($$
    select task_index, status
    from pgflow.step_tasks
    where run_id = '%s'::uuid and step_slug = 'map_step'
    order by task_index
  $$, :'test_run_id'),
  $$ values (0, 'failed'), (1, 'cancelled'), (2, 'cancelled') $$,
  'Task statuses should be (0, failed), (1, cancelled), (2, cancelled)'
);

-- CRITICAL TEST: No active task rows remain on the failed run
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid
     and status in ('queued', 'started')),
  0,
  'Failed run should have zero task rows with status queued or started'
);

-- Test: Step state should be marked as failed
select is(
  (select status from pgflow.step_states
   where run_id = :'test_run_id'::uuid
     and step_slug = 'map_step'),
  'failed',
  'Map step should be marked as failed'
);

-- CRITICAL TEST: All messages should be archived (removed from queue)
select is(
  (select count(*) from pgmq.q_test_map_fail),
  0::bigint,
  'All 3 messages should be archived (removed from queue) when one map task fails'
);

-- Test: Verify messages were actually archived, not deleted
select is(
  (select count(*) from pgmq.a_test_map_fail),
  3::bigint,
  'All 3 messages should be in archive table'
);

-- Test: Cancellation preserves history fields (worker identity, attempts, timestamps)
select is(
  (select last_worker_id = :'test_worker_id'::uuid
   from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1),
  true,
  'Cancelled started task should preserve last_worker_id'
);

select is(
  (select attempts_count from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'map_step' and task_index = 1),
  1,
  'Cancelled started task should preserve attempts_count'
);

select * from finish();
rollback;
