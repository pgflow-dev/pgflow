-- Requeue stalled tasks that have been in 'started' status longer than their effective
-- timeout (step override with flow fallback) + 30s buffer. This matches the effective
-- timeout used by claim_tasks() for PGMQ visibility, without its +2s visibility margin.
-- This handles tasks that got stuck when workers crashed without completing them
create or replace function pgflow.requeue_stalled_tasks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_count int := 0;
  max_requeues constant int := 3;
begin
  -- Find and requeue stalled tasks (where started_at > effective timeout + 30s buffer)
  -- Tasks with requeued_count >= max_requeues will have their message archived
  -- but status left as 'started' for easy identification via requeued_count column
  -- Eligibility requires the parent run AND parent step to still be 'started':
  -- stale rows on failed runs or terminal steps must not be revived (#645).
  --
  -- Lock order (#650): eligible parent runs and step states are locked before
  -- task rows (ordered by (run_id, step_slug, task_index)), with SKIP LOCKED
  -- so a blocked parent/run/task is skipped, not waited on. Status and timeout
  -- predicates are rechecked under those locks by EvalPlanQual, so a parent
  -- that failed while we waited is not revived.
  with stalled_tasks as (
    select
      st.run_id,
      st.step_slug,
      st.task_index,
      st.message_id,
      st.queue_name,
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
    order by st.run_id, st.step_slug, st.task_index
    for update of r, ss, st skip locked
  ),
  -- Separate tasks that can be requeued from those that exceeded max requeues
  to_requeue as (
    select * from stalled_tasks where requeued_count < max_requeues
  ),
  to_archive as (
    select * from stalled_tasks where requeued_count >= max_requeues
  ),
  -- Update tasks that will be requeued; the queue comes from the task snapshot
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
    returning tr.queue_name as queue_name, tr.message_id
  ),
  -- Make requeued messages visible immediately (batched per queue snapshot)
  visibility_reset as (
    select pgflow.set_vt_batch(
      r.queue_name,
      array_agg(r.message_id order by r.message_id),
      array_agg(0 order by r.message_id)  -- all offsets are 0 (immediate visibility)
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
  -- Archive messages for tasks that exceeded max requeues (batched per queue
  -- snapshot; never grouped across queues)
  archived as (
    select pgmq.archive(ta.queue_name, array_agg(ta.message_id))
    from to_archive ta
    where ta.message_id is not null
    group by ta.queue_name
  )
  -- Force execution of every side-effecting CTE regardless of join order:
  -- a cross join with an empty relation could skip scanning the forcing
  -- wrappers, so they are evaluated as scalar subqueries that always run.
  select
    (select count(*) from requeued)
    + 0 * coalesce(
        (select count(*) from visibility_reset)
        + (select count(*) from mark_permanently_stalled)
        + (select count(*) from archived),
        0
      )
  into result_count;

  return result_count;
end;
$$;
