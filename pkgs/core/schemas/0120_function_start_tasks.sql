-- Compatibility wrapper for the existing plain-worker SQL claim signature
-- (#650). Resolves the exact flow's canonical default queue and delegates to
-- the queue-aware claim boundary pgflow.claim_tasks().
--
-- On a fatal classification this wrapper returns no tasks and emits a
-- body-free SQL warning; it cannot express the JSON fatal result and is not a
-- supported worker startup compatibility layer. The new worker calls
-- claim_tasks directly.
create or replace function pgflow.start_tasks(
  flow_slug text,
  msg_ids bigint [],
  worker_id uuid
)
returns setof pgflow.step_task_record
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_result jsonb;
  v_task jsonb;
begin
  select pgflow.claim_tasks(
    lower(start_tasks.flow_slug),
    start_tasks.flow_slug,
    start_tasks.msg_ids,
    start_tasks.worker_id
  ) into v_result;

  if v_result ->> 'status' = 'fatal' then
    raise warning 'start_tasks(): fatal claim classification for flow % (no tasks started)', start_tasks.flow_slug;
    return;
  end if;

  for v_task in select * from jsonb_array_elements(v_result -> 'tasks')
  loop
    return query
    select
      (v_task ->> 'flow_slug')::text,
      (v_task ->> 'run_id')::uuid,
      (v_task ->> 'step_slug')::text,
      v_task -> 'input',
      (v_task ->> 'msg_id')::bigint,
      (v_task ->> 'task_index')::int,
      case
        when jsonb_typeof(v_task -> 'flow_input') is distinct from 'null'
          then v_task -> 'flow_input'
        else null
      end;
  end loop;
end;
$$;
