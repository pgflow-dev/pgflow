create or replace function pgflow._archive_task_message(
  p_run_id uuid,
  p_step_slug text,
  p_task_index int
)
returns void
language sql
volatile
set search_path to ''
as $$
  SELECT pgmq.archive(
    r.flow_slug,
    ARRAY_AGG(st.message_id)
  )
  FROM pgflow.step_tasks st
  JOIN pgflow.runs r ON st.run_id = r.run_id
  WHERE st.run_id = p_run_id
    AND st.step_slug = p_step_slug
    AND st.task_index = p_task_index
    AND st.message_id IS NOT NULL
  GROUP BY r.flow_slug
  HAVING COUNT(st.message_id) > 0;
$$;
