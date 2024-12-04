SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.fail_step_task(
    run_id UUID,
    step_slug TEXT,
    error JSONB
)
RETURNS VOID AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    p_error JSONB := error;
    v_task pgflow.step_tasks%ROWTYPE;
BEGIN
    UPDATE pgflow.step_tasks se
    SET
        status = 'failed',
        result = p_error
    WHERE se.run_id = p_run_id
    AND se.step_slug = p_step_slug
    RETURNING se.* INTO v_task;

    IF v_task.attempt_count < v_task.max_attempts THEN
        PERFORM pgflow.retry_step_task(p_run_id, p_step_slug);
    ELSE
        PERFORM pgflow.fail_step(p_run_id, p_step_slug, p_error::TEXT);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
