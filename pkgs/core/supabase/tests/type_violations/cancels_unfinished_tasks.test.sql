-- Test: type violations cancel unfinished tasks across independent branches
-- The directly invalid task stays failed with its output and TYPE_VIOLATION error;
-- completed work stays completed; queued and started unrelated tasks become cancelled.
begin;
select plan(9);
select pgflow_tests.reset_db();

select pgflow.create_flow('type_violation_cancel');
select pgflow.add_step(
  flow_slug => 'type_violation_cancel',
  step_slug => 'producer',
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'type_violation_cancel',
  step_slug => 'branch1',
  deps_slugs => array['producer'],
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'type_violation_cancel',
  step_slug => 'branch2',
  deps_slugs => array['producer'],
  step_type => 'single'
);
select pgflow.add_step(
  flow_slug => 'type_violation_cancel',
  step_slug => 'branch3',
  deps_slugs => array['producer'],
  step_type => 'single'
);
-- This map step expects arrays from branch1
select pgflow.add_step(
  flow_slug => 'type_violation_cancel',
  step_slug => 'consumer_map',
  deps_slugs => array['branch1'],
  step_type => 'map'
);

-- Start flow
select run_id as test_run_id from pgflow.start_flow('type_violation_cancel', '{}') \gset

-- Start and complete producer to spawn the branches
select pgflow_tests.ensure_worker('type_violation_cancel');
select * from pgflow_tests.read_and_start('type_violation_cancel', 1, 1) limit 1;
select pgflow.complete_task(:'test_run_id'::uuid, 'producer', 0, '{"data": "test"}'::jsonb);

-- Install a guard on the queue table: archiving (DELETE) is only allowed once the
-- owning step_tasks row left queued/started. If the type-violation path archives
-- messages before terminalizing their tasks, this trigger raises.
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
before delete on pgmq.q_type_violation_cancel
for each row execute function pg_temp.assert_task_terminalized_before_archive();

-- psql cannot interpolate :'test_run_id' inside dollar quotes, so pass it via temp table
select :'test_run_id'::uuid as run_id into temporary test_run_ids;

-- Start branch1 and branch2 (started siblings); branch3 stays queued
select message_id as msg_b1 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'branch1' \gset
select pgflow.start_tasks('type_violation_cancel', array[:'msg_b1'::bigint], '11111111-1111-1111-1111-111111111111'::uuid);

select message_id as msg_b2 from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'branch2' \gset
select pgflow.start_tasks('type_violation_cancel', array[:'msg_b2'::bigint], '11111111-1111-1111-1111-111111111111'::uuid);

-- Trigger type violation by completing branch1 with a non-array (consumer_map expects array)
select lives_ok(
  $$
    select pgflow.complete_task(
      (select run_id from test_run_ids),
      'branch1',
      0,
      '{"not": "an array"}'::jsonb
    )
  $$,
  'type violation should archive messages only after terminalizing their tasks'
);

-- Invalid task failed with preserved output and TYPE_VIOLATION error
select is(
  (select status from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'branch1'),
  'failed',
  'Directly invalid task should be failed'
);

select is(
  (select output from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'branch1'),
  '{"not": "an array"}'::jsonb,
  'Invalid task should preserve the output that caused the violation'
);

select matches(
  (select error_message from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'branch1'),
  '^\[TYPE_VIOLATION\].*',
  'Invalid task should keep its TYPE_VIOLATION error'
);

-- Completed independent work stays completed
select is(
  (select status from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and step_slug = 'producer'),
  'completed',
  'Previously completed task should stay completed'
);

-- Unfinished tasks become cancelled
select results_eq(
  format($$
    select step_slug, status
    from pgflow.step_tasks
    where run_id = '%s'::uuid and step_slug in ('branch2', 'branch3')
    order by step_slug
  $$, :'test_run_id'),
  $$ values ('branch2', 'cancelled'), ('branch3', 'cancelled') $$,
  'Started and queued unrelated tasks should become cancelled'
);

-- Failed-run invariant
select is(
  (select count(*)::int from pgflow.step_tasks
   where run_id = :'test_run_id'::uuid and status in ('queued', 'started')),
  0,
  'Failed run should have zero task rows with status queued or started'
);

select is(
  (select status from pgflow.runs where run_id = :'test_run_id'::uuid),
  'failed',
  'Run should be failed after the type violation'
);

-- All messages archived
select is(
  (select count(*) from pgmq.q_type_violation_cancel),
  0::bigint,
  'All messages should be archived after the type violation'
);

select * from finish();
rollback;
