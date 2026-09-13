create or replace function pgflow._archive_task_message(
  p_run_id uuid,
  p_step_slug text,
  p_task_index int
)
returns void
language sql
volatile
set search_path = ''
as $$
  -- Archive through the task's stored queue snapshot (#650), resolved to the
  -- spelling listed in pgmq for queues created by older releases.
  SELECT pgmq.archive(
    pgflow._effective_queue_name(st.queue_name),
    ARRAY_AGG(st.message_id)
  )
  FROM pgflow.step_tasks st
  WHERE st.run_id = p_run_id
    AND st.step_slug = p_step_slug
    AND st.task_index = p_task_index
    AND st.message_id IS NOT NULL
  GROUP BY st.queue_name
  HAVING COUNT(st.message_id) > 0;
$$;
