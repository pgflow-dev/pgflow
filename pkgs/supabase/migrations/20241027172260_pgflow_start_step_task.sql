CREATE OR REPLACE FUNCTION pgflow.start_step_task(
    run_id UUID,
    step_slug TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    v_run runs%ROWTYPE;
    v_task step_tasks%ROWTYPE;
BEGIN
    PERFORM pgflow_locks.process_step_task_in_serial(p_run_id, p_step_slug);

    v_run := find_run(p_run_id);
    v_task := find_step_task(p_run_id, p_step_slug);

    PERFORM verify_status(v_task, 'queued');

    UPDATE step_tasks AS st
    SET status = 'started', last_attempt_at = now(), next_attempt_at = NULL
    WHERE st.run_id = v_task.run_id
    AND st.step_slug = v_task.step_slug;

    IF v_task.message_id IS NOT NULL THEN
        PERFORM pgmq.archive('pgflow', v_task.message_id);
    END IF;
END;
$$;
