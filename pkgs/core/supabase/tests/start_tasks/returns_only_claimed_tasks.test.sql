-- Regression: start_tasks must return only rows claimed by its guarded update.
-- A concurrent skip can win the task-row lock, making the guarded UPDATE affect
-- zero rows (EvalPlanQual recheck of status = 'queued' fails). start_tasks must
-- not return the stale candidate row for that task (#638).
begin;
select plan(2);
select pgflow_tests.reset_db();

select pgflow.create_flow('start_claim_guard');
select pgflow.add_step('start_claim_guard', 'step_a');
select run_id as test_run_id
from pgflow.start_flow('start_claim_guard', '{}'::jsonb) \gset
select message_id as test_message_id
from pgflow.step_tasks
where run_id = :'test_run_id'::uuid and step_slug = 'step_a' \gset

-- Suppress only the queued -> started transition of this flow's tasks.
-- This models a concurrent skip winning the row lock: the guarded UPDATE
-- claims nothing, even though the candidate SELECT saw the queued row.
create function pg_temp.suppress_task_claim()
returns trigger
language plpgsql
as $$
begin
  return null;
end;
$$;

create trigger suppress_task_claim
before update on pgflow.step_tasks
for each row
when (
  old.flow_slug = 'start_claim_guard'
  and old.status = 'queued'
  and new.status = 'started'
)
execute function pg_temp.suppress_task_claim();

-- TEST: start_tasks returns zero rows when the guarded update claims nothing
select is(
  (select count(*)::int from pgflow.start_tasks(
    'start_claim_guard',
    array[:'test_message_id'::bigint],
    pgflow_tests.ensure_worker('start_claim_guard')
  )),
  0,
  'start_tasks should return only rows claimed by the guarded update'
);

-- TEST: the unclaimed task stays queued and untouched
select is(
  (select status || ':' || attempts_count::text
   from pgflow.step_tasks
   where message_id = :'test_message_id'::bigint),
  'queued:0',
  'Unclaimed task should remain queued with attempts_count = 0'
);

select finish();
rollback;
