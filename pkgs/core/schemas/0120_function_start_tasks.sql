create or replace function pgflow.start_tasks(
  flow_slug text,
  msg_ids bigint [],
  worker_id uuid
)
returns setof pgflow.step_task_record
volatile
set search_path to ''
language sql
as $$
  with tasks as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id
    from pgflow.step_tasks as task
    where task.flow_slug = start_tasks.flow_slug
      and task.message_id = any(msg_ids)
      and task.status = 'queued'
  ),
  start_tasks_update as (
    update pgflow.step_tasks
    set 
      attempts_count = attempts_count + 1,
      status = 'started',
      started_at = now(),
      last_worker_id = worker_id
    from tasks
    where step_tasks.message_id = tasks.message_id
      and step_tasks.flow_slug = tasks.flow_slug
      and step_tasks.status = 'queued'
  ),
  runs as (
    select
      r.run_id,
      r.input
    from pgflow.runs r
    where r.run_id in (select run_id from tasks)
  ),
  deps as (
    select
      st.run_id,
      st.step_slug,
      dep.dep_slug,
      dep_task.output as dep_output
    from tasks st
    join pgflow.deps dep on dep.flow_slug = st.flow_slug and dep.step_slug = st.step_slug
    join pgflow.step_tasks dep_task on
      dep_task.run_id = st.run_id and
      dep_task.step_slug = dep.dep_slug and
      dep_task.status = 'completed'
  ),
  deps_outputs as (
    select
      d.run_id,
      d.step_slug,
      jsonb_object_agg(d.dep_slug, d.dep_output) as deps_output
    from deps d
    group by d.run_id, d.step_slug
  ),
  timeouts as (
    select
      task.message_id,
      task.flow_slug,
      coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
    from tasks task
    join pgflow.flows flow on flow.flow_slug = task.flow_slug
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
  ),
  -- Batch update visibility timeouts for all messages
  set_vt_batch as (
    select pgflow.set_vt_batch(
      start_tasks.flow_slug,
      array_agg(t.message_id order by t.message_id),
      array_agg(t.vt_delay order by t.message_id)
    )
    from timeouts t
  )
  select
    st.flow_slug,
    st.run_id,
    st.step_slug,
    jsonb_build_object('run', r.input) ||
    coalesce(dep_out.deps_output, '{}'::jsonb) as input,
    st.message_id as msg_id
  from tasks st
  join runs r on st.run_id = r.run_id
  left join deps_outputs dep_out on
    dep_out.run_id = st.run_id and
    dep_out.step_slug = st.step_slug
$$;
