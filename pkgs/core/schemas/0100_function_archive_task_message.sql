-- Archive a single task's queue message using the task's queue snapshot.
-- Lock order: parent/run, step state, then task row, then queue row (#650).
-- Re-entrant with callers that already hold these row locks.
create or replace function pgflow._archive_task_message(
  p_run_id uuid,
  p_step_slug text,
  p_task_index int
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_batch record;
begin
  PERFORM 1 FROM pgflow.runs r
  WHERE r.run_id = p_run_id
  FOR UPDATE;

  PERFORM 1 FROM pgflow.step_states ss
  WHERE ss.run_id = p_run_id
    AND ss.step_slug = p_step_slug
  FOR UPDATE;

  FOR v_batch IN
    WITH locked_tasks AS (
      SELECT task.queue_name, task.message_id
      FROM pgflow.step_tasks task
      WHERE task.run_id = p_run_id
        AND task.step_slug = p_step_slug
        AND task.task_index = p_task_index
        AND task.message_id IS NOT NULL
      ORDER BY task.task_index
      FOR UPDATE
    )
    SELECT
      lt.queue_name,
      ARRAY_AGG(lt.message_id ORDER BY lt.message_id) AS ids
    FROM locked_tasks lt
    GROUP BY lt.queue_name
  LOOP
    PERFORM pgmq.archive(v_batch.queue_name, v_batch.ids);
  END LOOP;
END;
$$;
