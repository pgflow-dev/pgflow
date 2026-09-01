-- Modify "requeue_stalled_tasks" function
CREATE OR REPLACE FUNCTION "pgflow"."requeue_stalled_tasks" () RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = '' AS $$
declare
  result_count int := 0;
  max_requeues constant int := 3;
begin
  -- Find and requeue stalled tasks (where started_at > effective timeout + 30s buffer)
  -- Tasks with requeued_count >= max_requeues will have their message archived
  -- but status left as 'started' for easy identification via requeued_count column
  -- Eligibility requires the parent run AND parent step to still be 'started':
  -- stale rows on failed runs or terminal steps must not be revived (#645).
  with stalled_tasks as (
    select
      st.run_id,
      st.step_slug,
      st.task_index,
      st.message_id,
      r.flow_slug,
      st.requeued_count
    from pgflow.step_tasks st
    join pgflow.runs r on r.run_id = st.run_id
    join pgflow.step_states ss on ss.run_id = st.run_id and ss.step_slug = st.step_slug
    join pgflow.flows f on f.flow_slug = r.flow_slug
    join pgflow.steps s on s.flow_slug = r.flow_slug and s.step_slug = st.step_slug
    where st.status = 'started'
      and r.status = 'started'
      and ss.status = 'started'
      and st.permanently_stalled_at is null
      and st.started_at < now()
        - (coalesce(s.opt_timeout, f.opt_timeout) * interval '1 second')
        - interval '30 seconds'
    for update of st skip locked
  ),
  -- Separate tasks that can be requeued from those that exceeded max requeues
  to_requeue as (
    select * from stalled_tasks where requeued_count < max_requeues
  ),
  to_archive as (
    select * from stalled_tasks where requeued_count >= max_requeues
  ),
  -- Update tasks that will be requeued
  requeued as (
    update pgflow.step_tasks st
    set
      status = 'queued',
      started_at = null,
      last_worker_id = null,
      requeued_count = st.requeued_count + 1,
      last_requeued_at = now()
    from to_requeue tr
    where st.run_id = tr.run_id
      and st.step_slug = tr.step_slug
      and st.task_index = tr.task_index
    returning tr.flow_slug as queue_name, tr.message_id
  ),
  -- Make requeued messages visible immediately (batched per queue)
  visibility_reset as (
    select pgflow.set_vt_batch(
      r.queue_name,
      array_agg(r.message_id),
      array_agg(0)  -- all offsets are 0 (immediate visibility)
    )
    from requeued r
    where r.message_id is not null
    group by r.queue_name
  ),
  -- Mark tasks as permanently stalled before archiving
  mark_permanently_stalled as (
    update pgflow.step_tasks st
    set permanently_stalled_at = now()
    from to_archive ta
    where st.run_id = ta.run_id
      and st.step_slug = ta.step_slug
      and st.task_index = ta.task_index
    returning st.run_id
  ),
  -- Archive messages for tasks that exceeded max requeues (batched per queue)
  archived as (
    select pgmq.archive(ta.flow_slug, array_agg(ta.message_id))
    from to_archive ta
    where ta.message_id is not null
    group by ta.flow_slug
  ),
  -- Force execution of visibility_reset CTE
  _vr as (select count(*) from visibility_reset),
  -- Force execution of mark_permanently_stalled CTE
  _mps as (select count(*) from mark_permanently_stalled),
  -- Force execution of archived CTE
  _ar as (select count(*) from archived)
  select count(*) into result_count
  from requeued, _vr, _mps, _ar;

  return result_count;
end;
$$;
