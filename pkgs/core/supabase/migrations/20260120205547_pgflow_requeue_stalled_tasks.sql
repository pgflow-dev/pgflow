-- Modify "step_tasks" table
ALTER TABLE "pgflow"."step_tasks" ADD COLUMN "requeued_count" integer NOT NULL DEFAULT 0, ADD COLUMN "last_requeued_at" timestamptz NULL, ADD COLUMN "permanently_stalled_at" timestamptz NULL;
-- Create "requeue_stalled_tasks" function
CREATE FUNCTION "pgflow"."requeue_stalled_tasks" () RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = '' AS $$
declare
  result_count int := 0;
  max_requeues constant int := 3;
begin
  -- Find and requeue stalled tasks (where started_at > timeout + 30s buffer)
  -- Tasks with requeued_count >= max_requeues will have their message archived
  -- but status left as 'started' for easy identification via requeued_count column
  with stalled_tasks as (
    select
      st.run_id,
      st.step_slug,
      st.task_index,
      st.message_id,
      r.flow_slug,
      st.requeued_count,
      f.opt_timeout
    from pgflow.step_tasks st
    join pgflow.runs r on r.run_id = st.run_id
    join pgflow.flows f on f.flow_slug = r.flow_slug
    where st.status = 'started'
      and st.permanently_stalled_at is null
      and st.started_at < now() - (f.opt_timeout * interval '1 second') - interval '30 seconds'
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
-- Create "setup_requeue_stalled_tasks_cron" function
CREATE FUNCTION "pgflow"."setup_requeue_stalled_tasks_cron" ("cron_interval" text DEFAULT '15 seconds') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET "search_path" = pgflow, cron, pg_temp AS $$
declare
  job_id bigint;
begin
  -- Remove existing job if any
  begin
    perform cron.unschedule('pgflow_requeue_stalled_tasks');
  exception
    when others then null;
  end;

  -- Schedule the new job
  job_id := cron.schedule(
    job_name => 'pgflow_requeue_stalled_tasks',
    schedule => setup_requeue_stalled_tasks_cron.cron_interval,
    command => 'select pgflow.requeue_stalled_tasks()'
  );

  return format('Scheduled pgflow_requeue_stalled_tasks (every %s, job_id=%s)', 
    setup_requeue_stalled_tasks_cron.cron_interval, job_id);
end;
$$;
-- Set comment to function: "setup_requeue_stalled_tasks_cron"
COMMENT ON FUNCTION "pgflow"."setup_requeue_stalled_tasks_cron" IS 'Sets up cron job to automatically requeue stalled tasks.
Schedules pgflow_requeue_stalled_tasks at the specified cron_interval (default: 15 seconds).
Replaces existing job if it exists (idempotent).
Returns a confirmation message with job ID.';
-- Automatically set up the cron job
SELECT pgflow.setup_requeue_stalled_tasks_cron();
