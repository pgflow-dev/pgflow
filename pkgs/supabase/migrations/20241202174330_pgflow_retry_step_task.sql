CREATE OR REPLACE FUNCTION pgflow.retry_step_task(
    run_id uuid,
    step_slug text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    p_run_id uuid := run_id;
    p_step_slug text := step_slug;
    v_task step_tasks%ROWTYPE;
BEGIN
    v_task := find_step_task(p_run_id, p_step_slug);

    IF v_task.status = 'failed' THEN
        PERFORM enqueue_step_task(
            flow_slug := v_task.flow_slug,
            run_id := v_task.run_id,
            step_slug := v_task.step_slug,
            payload := v_task.payload
        );
    ELSE
        RAISE EXCEPTION 'Step task is not "failed", but "%" instead: run_id=%, step_slug=%',
            v_task.status, p_run_id, p_step_slug;
        RETURN;
    END IF;
END;
$$
