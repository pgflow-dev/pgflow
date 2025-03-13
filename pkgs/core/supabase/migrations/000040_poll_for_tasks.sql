create or replace function pgflow.poll_for_tasks(
  queue_name text,
  vt integer,
  qty integer,
  max_poll_seconds integer default 5,
  poll_interval_ms integer default 100
)
returns setof pgflow.worker_task
volatile
set search_path to ''
as $$

with polled_messages as (
  select *
  from pgflow.read_with_poll(
    queue_name,
    vt,
    qty,
    max_poll_seconds,
    poll_interval_ms
  )
),
step_tasks as (
  select
    task.flow_slug,
    task.run_id,
    task.step_slug,
    task.task_index
  from pgflow.step_tasks as task
  join polled_messages as message on message.msg_id = task.message_id
  where task.message_id = message.msg_id
    and task.status = 'queued'
),
runs_data as (
  select
    r.run_id,
    r.input
  from pgflow.runs r
  where r.run_id in (select run_id from step_tasks)
),
dependencies as (
  select
    st.run_id,
    st.step_slug,
    deps.dep_slug,
    dep_tasks.output as dep_output
  from step_tasks st
  join pgflow.step_states ss on ss.run_id = st.run_id and ss.step_slug = st.step_slug
  join pgflow.steps s on s.flow_slug = st.flow_slug and s.step_slug = st.step_slug
  join pgflow.deps deps on deps.flow_slug = st.flow_slug and deps.step_slug = st.step_slug
  join pgflow.step_tasks dep_tasks on
    dep_tasks.run_id = st.run_id and
    dep_tasks.step_slug = deps.dep_slug and
    dep_tasks.status = 'completed'
),
dependency_outputs as (
  select
    d.run_id,
    d.step_slug,
    jsonb_object_agg(d.dep_slug, d.dep_output) as deps_output
  from dependencies d
  group by d.run_id, d.step_slug
)

select
  st.flow_slug,
  st.run_id,
  st.step_slug,
  jsonb_build_object('run', r.input) ||
  coalesce(dep_out.deps_output, '{}'::jsonb) as input
from step_tasks st
join runs_data r on st.run_id = r.run_id
left join dependency_outputs dep_out on
  dep_out.run_id = st.run_id and
  dep_out.step_slug = st.step_slug;

$$ language sql;



