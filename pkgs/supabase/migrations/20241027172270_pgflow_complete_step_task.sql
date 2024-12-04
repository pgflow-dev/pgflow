SET search_path TO pgflow;

CREATE OR REPLACE FUNCTION pgflow.complete_step_task(
    run_id UUID,
    step_slug TEXT,
    result JSONB
)
RETURNS VOID AS $$
DECLARE
    p_run_id UUID := run_id;
    p_step_slug TEXT := step_slug;
    p_result JSONB := result;
BEGIN
    UPDATE pgflow.step_tasks se
    SET status = 'completed', result = p_result
    WHERE se.run_id = p_run_id
    AND se.step_slug = p_step_slug;

    PERFORM pgflow.complete_step(p_run_id, p_step_slug, p_result);
END;
$$ LANGUAGE plpgsql VOLATILE;
