-- Modify "poll_for_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."poll_for_tasks" ("queue_name" text, "vt" integer, "qty" integer, "max_poll_seconds" integer DEFAULT 5, "poll_interval_ms" integer DEFAULT 100) RETURNS SETOF "pgflow"."step_task_record" LANGUAGE plpgsql SET "search_path" = '' AS $$
declare
  msg_ids bigint[];
begin
  -- First statement: Read messages and capture their IDs
  -- This gets its own snapshot and can see newly committed messages
  select array_agg(msg_id)
  into msg_ids
  from pgflow.read_with_poll(
    queue_name,
    vt,
    qty,
    max_poll_seconds,
    poll_interval_ms
  );

  -- If no messages were read, return empty set
  if msg_ids is null or array_length(msg_ids, 1) is null then
    return;
  end if;

  -- Second statement: Process tasks with fresh snapshot
  -- This can now see step_tasks that were committed during the poll
  return query
  with tasks as (
    select
      task.flow_slug,
      task.run_id,
      task.step_slug,
      task.task_index,
      task.message_id
    from pgflow.step_tasks as task
    where task.message_id = any(msg_ids)
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
  ),
  timeouts as (
    select
      task.message_id,
      coalesce(step.opt_timeout, flow.opt_timeout) + 2 as vt_delay
    from tasks task
    join pgflow.flows flow on flow.flow_slug = task.flow_slug
    join pgflow.steps step on step.flow_slug = task.flow_slug and step.step_slug = task.step_slug
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
  cross join lateral (
    -- TODO: this is slow because it calls set_vt for each row, and set_vt
    --       builds dynamic query from string every time it is called
    --       implement set_vt_batch(msgs_ids bigint[], vt_delays int[])
    select pgmq.set_vt(queue_name, st.message_id,
      (select t.vt_delay from timeouts t where t.message_id = st.message_id)
    )
  ) set_vt;
end;
$$;
