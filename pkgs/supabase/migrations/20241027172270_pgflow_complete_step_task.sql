CREATE OR REPLACE FUNCTION pgflow.complete_step_task(
    run_id UUID,
    step_slug TEXT,
    result JSONB
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path TO pgflow
AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    p_result JSONB := result;
    v_task step_tasks%ROWTYPE;
BEGIN
    v_task := find_step_task(p_run_id, p_step_slug);
    PERFORM verify_status(v_task, 'started');

    UPDATE step_tasks se
    SET status = 'completed', result = p_result
    WHERE se.run_id = p_run_id
    AND se.step_slug = p_step_slug;

    PERFORM complete_step(p_run_id, p_step_slug, p_result);
END;
$$;
