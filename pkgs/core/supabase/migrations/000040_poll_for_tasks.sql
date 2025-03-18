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

with read_messages as (
  select *
  from pgflow.read_with_poll(
    queue_name,
    vt,
    qty,
    max_poll_seconds,
    poll_interval_ms
  )
),
tasks as (
  select
    task.flow_slug,
    task.run_id,
    task.step_slug,
    task.task_index,
    task.message_id
  from pgflow.step_tasks as task
  join read_messages as message on message.msg_id = task.message_id
  where task.message_id = message.msg_id
    and task.status = 'queued'
),
increment_attempts as (
  update pgflow.step_tasks
  set attempts_count = attempts_count + 1
  from tasks
  where step_tasks.message_id = tasks.message_id
  and status = 'queued'
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
)

select
  st.flow_slug,
  st.run_id,
  st.step_slug,
  jsonb_build_object('run', r.input) ||
  coalesce(dep_out.deps_output, '{}'::jsonb) as input
from tasks st
join runs r on st.run_id = r.run_id
left join deps_outputs dep_out on
  dep_out.run_id = st.run_id and
  dep_out.step_slug = st.step_slug;

$$ language sql;
