CREATE OR REPLACE FUNCTION pgflow.retry_stale_step_tasks()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    v_task step_tasks%ROWTYPE;
BEGIN
    FOR v_task IN
        SELECT *
        FROM step_tasks
        WHERE status = 'queued'
        AND next_attempt_at < now() - interval '2 seconds'
    LOOP
        PERFORM enqueue_step_task(
            v_task.flow_slug,
            v_task.run_id,
            v_task.step_slug,
            v_task.payload
        );
    END LOOP;
END;
$$;
