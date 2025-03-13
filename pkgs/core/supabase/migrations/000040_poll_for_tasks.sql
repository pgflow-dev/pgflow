create type pgflow.worker_task as (
  flow_slug TEXT,
  run_id UUID,
  step_slug TEXT,
  input JSONB
);

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
updated_step_tasks as (
  update pgflow.step_tasks
  set status = 'started'
  from polled_messages
  where message_id = polled_messages.msg_id
    and status = 'queued'
  returning
    pgflow.step_tasks.*
),
runs_data as (
  select
    r.run_id,
    r.input
  from pgflow.runs r
  where r.run_id in (select run_id from updated_step_tasks)
)

select
  st.flow_slug,
  st.run_id,
  st.step_slug,
  jsonb_build_object('run', r.input)
from updated_step_tasks st
join runs_data r on st.run_id = r.run_id;

$$ language sql;

